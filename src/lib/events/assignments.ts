import { Prisma } from '@/generated/prisma/client'
import type { PrismaClient } from '@/generated/prisma/client'
import { ActionError } from '@/lib/auth/action'
import { recalculate } from '@/lib/attendance'
import type { Tx } from '@/lib/attendance/persist'
import { dateKey } from '@/lib/attendance/timezone'
import { baLocalToInstant, workDateOf } from './time'
import type { AssignmentInput, AssignmentStatus } from './schema'

type Db = PrismaClient

async function writeAssignmentAudit(
  tx: Tx,
  args: {
    id: string
    action: string
    actorId: string
    before: Record<string, unknown> | null
    after: Record<string, unknown> | null
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      domain: 'ASSIGNMENT',
      action: args.action,
      entityType: 'EventAssignment',
      entityId: args.id,
      before: args.before === null ? Prisma.DbNull : (args.before as Prisma.InputJsonValue),
      after: args.after === null ? Prisma.DbNull : (args.after as Prisma.InputJsonValue),
      actorId: args.actorId,
    },
  })
}

async function recalcPairs(
  db: Db,
  pairs: { employeeId: string; workDate: Date }[],
  actorId: string,
): Promise<void> {
  const seen = new Set<string>()
  for (const { employeeId, workDate } of pairs) {
    const k = `${employeeId}|${dateKey(workDate)}`
    if (seen.has(k)) continue
    seen.add(k)
    // CRÍTICO: toda mutación de asignación recalcula la asistencia del día.
    await recalculate(db, employeeId, workDate, actorId)
  }
}

export async function createAssignment(
  db: Db,
  eventId: string,
  input: AssignmentInput,
  actorId: string,
): Promise<string> {
  const event = await db.event.findFirst({ where: { id: eventId, deletedAt: null }, select: { id: true } })
  if (!event) throw new ActionError('NOT_FOUND', 'Evento no encontrado.')

  const startAt = baLocalToInstant(input.startAt)
  const endAt = baLocalToInstant(input.endAt)
  const workDate = workDateOf(startAt) // día de INICIO

  const created = await db.$transaction(async (tx) => {
    const a = await tx.eventAssignment.create({
      data: {
        eventId,
        employeeId: input.employeeId,
        role: input.role,
        isSupervisor: input.isSupervisor,
        workDate,
        startAt,
        endAt,
        status: 'PLANNED',
      },
      select: { id: true },
    })
    await writeAssignmentAudit(tx, { id: a.id, action: 'create', actorId, before: null, after: { status: 'PLANNED' } })
    return a
  })

  await recalcPairs(db, [{ employeeId: input.employeeId, workDate }], actorId)
  return created.id
}

export async function updateAssignment(
  db: Db,
  id: string,
  input: AssignmentInput,
  actorId: string,
): Promise<void> {
  const existing = await db.eventAssignment.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, employeeId: true, workDate: true },
  })
  if (!existing) throw new ActionError('NOT_FOUND', 'Asignación no encontrada.')

  const startAt = baLocalToInstant(input.startAt)
  const endAt = baLocalToInstant(input.endAt)
  const workDate = workDateOf(startAt)

  await db.eventAssignment.update({
    where: { id },
    data: {
      employeeId: input.employeeId,
      role: input.role,
      isSupervisor: input.isSupervisor,
      startAt,
      endAt,
      workDate,
    },
  })

  // Recalcula el día/empleado VIEJO y el NUEVO (pueden diferir).
  await recalcPairs(
    db,
    [
      { employeeId: existing.employeeId, workDate: existing.workDate },
      { employeeId: input.employeeId, workDate },
    ],
    actorId,
  )
}

export async function setAssignmentStatus(
  db: Db,
  id: string,
  status: AssignmentStatus,
  actorId: string,
): Promise<void> {
  const existing = await db.eventAssignment.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, employeeId: true, workDate: true, status: true },
  })
  if (!existing) throw new ActionError('NOT_FOUND', 'Asignación no encontrada.')
  if (existing.status === status) return

  await db.$transaction(async (tx) => {
    await tx.eventAssignment.update({ where: { id }, data: { status } })
    await writeAssignmentAudit(tx, {
      id,
      action: 'status',
      actorId,
      before: { status: existing.status },
      after: { status },
    })
  })

  // Marcar COMPLETED es lo que resuelve un día en UNVERIFIED.
  await recalcPairs(db, [{ employeeId: existing.employeeId, workDate: existing.workDate }], actorId)
}

export async function deleteAssignment(db: Db, id: string, actorId: string): Promise<void> {
  const existing = await db.eventAssignment.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, employeeId: true, workDate: true, status: true },
  })
  if (!existing) throw new ActionError('NOT_FOUND', 'Asignación no encontrada.')

  await db.$transaction(async (tx) => {
    await tx.eventAssignment.update({ where: { id }, data: { deletedAt: new Date() } })
    await writeAssignmentAudit(tx, {
      id,
      action: 'delete',
      actorId,
      before: { status: existing.status },
      after: { deletedAt: 'set' },
    })
  })

  await recalcPairs(db, [{ employeeId: existing.employeeId, workDate: existing.workDate }], actorId)
}

export interface ConflictReport {
  overlaps: { assignmentId: string; eventName: string; role: string; startAt: Date; endAt: Date }[]
  leave: { type: string } | null
}

/** Conflictos para AVISAR (no bloquear) al asignar: turnos solapados o licencia. */
export async function checkAssignmentConflicts(
  db: Db,
  args: { employeeId: string; startAt: Date; endAt: Date; excludeId?: string },
): Promise<ConflictReport> {
  const workDate = workDateOf(args.startAt)
  const [overlaps, leave] = await Promise.all([
    db.eventAssignment.findMany({
      where: {
        employeeId: args.employeeId,
        deletedAt: null,
        status: { not: 'CANCELLED' },
        ...(args.excludeId ? { id: { not: args.excludeId } } : {}),
        startAt: { lt: args.endAt },
        endAt: { gt: args.startAt }, // se solapan en el tiempo
      },
      select: { id: true, role: true, startAt: true, endAt: true, event: { select: { name: true } } },
    }),
    db.leaveRequest.findFirst({
      where: {
        employeeId: args.employeeId,
        deletedAt: null,
        status: 'APPROVED',
        dateFrom: { lte: workDate },
        dateTo: { gte: workDate },
      },
      select: { type: true },
    }),
  ])

  return {
    overlaps: overlaps.map((o) => ({
      assignmentId: o.id,
      eventName: o.event.name,
      role: o.role ?? '',
      startAt: o.startAt,
      endAt: o.endAt,
    })),
    leave: leave ? { type: leave.type } : null,
  }
}
