import { Prisma } from '@/generated/prisma/client'
import type { PrismaClient } from '@/generated/prisma/client'
import { ActionError } from '@/lib/auth/action'
import { recalculate } from '@/lib/attendance'
import type { Tx } from '@/lib/attendance/persist'
import { dateKey } from '@/lib/attendance/timezone'
import { baLocalToInstant } from './time'
import type { EventInput, EventStatus } from './schema'

type Db = PrismaClient

async function writeAudit(
  tx: Tx,
  args: {
    domain: 'EVENT' | 'ASSIGNMENT'
    entityType: string
    entityId: string
    action: string
    actorId: string
    before: Record<string, unknown> | null
    after: Record<string, unknown> | null
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      domain: args.domain,
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      before: args.before === null ? Prisma.DbNull : (args.before as Prisma.InputJsonValue),
      after: args.after === null ? Prisma.DbNull : (args.after as Prisma.InputJsonValue),
      actorId: args.actorId,
    },
  })
}

export async function listEvents(db: Db, filters?: { status?: EventStatus }) {
  return db.event.findMany({
    where: { deletedAt: null, ...(filters?.status ? { status: filters.status } : {}) },
    orderBy: { startAt: 'desc' },
    select: {
      id: true,
      name: true,
      client: true,
      venue: true,
      status: true,
      startAt: true,
      endAt: true,
      _count: { select: { assignments: { where: { deletedAt: null } } } },
    },
  })
}

/** Eventos donde el empleado está asignado COMO SUPERVISOR. */
export async function listEventsForSupervisor(db: Db, employeeId: string) {
  return db.event.findMany({
    where: {
      deletedAt: null,
      assignments: { some: { employeeId, isSupervisor: true, deletedAt: null } },
    },
    orderBy: { startAt: 'desc' },
    select: { id: true, name: true, client: true, venue: true, status: true, startAt: true, endAt: true },
  })
}

export async function getEvent(db: Db, id: string) {
  return db.event.findFirst({
    where: { id, deletedAt: null },
    include: {
      assignments: {
        where: { deletedAt: null },
        orderBy: { startAt: 'asc' },
        include: { employee: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
  })
}

/** ¿Puede el supervisor (por su employeeId) acceder a este evento? */
export async function canSupervisorAccessEvent(db: Db, employeeId: string, eventId: string): Promise<boolean> {
  const a = await db.eventAssignment.findFirst({
    where: { eventId, employeeId, isSupervisor: true, deletedAt: null },
    select: { id: true },
  })
  return a !== null
}

export async function createEvent(db: Db, input: EventInput, actorId: string): Promise<string> {
  const ev = await db.$transaction(async (tx) => {
    const created = await tx.event.create({
      data: {
        name: input.name,
        client: input.client || null,
        venue: input.venue || null,
        startAt: baLocalToInstant(input.startAt),
        endAt: baLocalToInstant(input.endAt),
        status: 'DRAFT',
      },
      select: { id: true },
    })
    await writeAudit(tx, {
      domain: 'EVENT',
      entityType: 'Event',
      entityId: created.id,
      action: 'create',
      actorId,
      before: null,
      after: { status: 'DRAFT' },
    })
    return created
  })
  return ev.id
}

export async function updateEvent(db: Db, id: string, input: EventInput): Promise<void> {
  const existing = await db.event.findFirst({ where: { id, deletedAt: null }, select: { id: true } })
  if (!existing) throw new ActionError('NOT_FOUND', 'Evento no encontrado.')
  await db.event.update({
    where: { id },
    data: {
      name: input.name,
      client: input.client || null,
      venue: input.venue || null,
      startAt: baLocalToInstant(input.startAt),
      endAt: baLocalToInstant(input.endAt),
    },
  })
}

/**
 * Cambia el status del evento. Si pasa a CANCELLED, PROPAGA CANCELLED a todas
 * sus asignaciones activas y recalcula la asistencia de cada (empleado, día)
 * afectado — así ningún día queda con expectativa de un evento cancelado.
 */
export async function setEventStatus(
  db: Db,
  id: string,
  status: EventStatus,
  actorId: string,
): Promise<void> {
  const existing = await db.event.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, status: true },
  })
  if (!existing) throw new ActionError('NOT_FOUND', 'Evento no encontrado.')
  if (existing.status === status) return

  const affected = await db.$transaction(async (tx) => {
    await tx.event.update({ where: { id }, data: { status } })
    await writeAudit(tx, {
      domain: 'EVENT',
      entityType: 'Event',
      entityId: id,
      action: 'status',
      actorId,
      before: { status: existing.status },
      after: { status },
    })

    if (status !== 'CANCELLED') return [] as { employeeId: string; workDate: Date }[]

    const asigs = await tx.eventAssignment.findMany({
      where: { eventId: id, deletedAt: null, status: { not: 'CANCELLED' } },
      select: { id: true, employeeId: true, workDate: true, status: true },
    })
    for (const a of asigs) {
      await tx.eventAssignment.update({ where: { id: a.id }, data: { status: 'CANCELLED' } })
      await writeAudit(tx, {
        domain: 'ASSIGNMENT',
        entityType: 'EventAssignment',
        entityId: a.id,
        action: 'status',
        actorId,
        before: { status: a.status },
        after: { status: 'CANCELLED' },
      })
    }
    return asigs.map((a) => ({ employeeId: a.employeeId, workDate: a.workDate }))
  })

  // Recalcular fuera de la transacción, deduplicando (empleado, día).
  const seen = new Set<string>()
  for (const { employeeId, workDate } of affected) {
    const k = `${employeeId}|${dateKey(workDate)}`
    if (seen.has(k)) continue
    seen.add(k)
    await recalculate(db, employeeId, workDate, actorId)
  }
}

/** Baja (soft delete) del evento: también da de baja sus asignaciones y recalcula. */
export async function softDeleteEvent(db: Db, id: string, actorId: string): Promise<void> {
  const existing = await db.event.findFirst({ where: { id, deletedAt: null }, select: { id: true } })
  if (!existing) throw new ActionError('NOT_FOUND', 'Evento no encontrado.')

  const affected = await db.$transaction(async (tx) => {
    const asigs = await tx.eventAssignment.findMany({
      where: { eventId: id, deletedAt: null },
      select: { id: true, employeeId: true, workDate: true },
    })
    await tx.eventAssignment.updateMany({ where: { eventId: id, deletedAt: null }, data: { deletedAt: new Date() } })
    await tx.event.update({ where: { id }, data: { deletedAt: new Date() } })
    await writeAudit(tx, {
      domain: 'EVENT',
      entityType: 'Event',
      entityId: id,
      action: 'delete',
      actorId,
      before: null,
      after: { deletedAt: 'set' },
    })
    return asigs
  })

  const seen = new Set<string>()
  for (const { employeeId, workDate } of affected) {
    const k = `${employeeId}|${dateKey(workDate)}`
    if (seen.has(k)) continue
    seen.add(k)
    await recalculate(db, employeeId, workDate, actorId)
  }
}
