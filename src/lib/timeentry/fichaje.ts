import { Prisma } from '@/generated/prisma/client'
import type { PrismaClient } from '@/generated/prisma/client'
import { ActionError } from '@/lib/auth/action'
import { recalculate } from '@/lib/attendance'
import type { Tx } from '@/lib/attendance/persist'
import { dateKey } from '@/lib/attendance/timezone'
import { workDateOf } from '@/lib/events/time'
import { canSupervisorAccessEvent } from '@/lib/events/events'

type Db = PrismaClient

/** Ubicación de una fichada. `denied` = el navegador negó el permiso; null = no
 *  se intentó. Se REGISTRA, no bloquea: sin GPS se ficha igual. */
export type LocationInput = { lat: number; lng: number; accuracy: number } | { denied: true } | null

function checkInLoc(loc: LocationInput) {
  if (!loc) return {}
  if ('denied' in loc) return { checkInLocationDenied: true }
  return { checkInLat: loc.lat, checkInLng: loc.lng, checkInAccuracy: loc.accuracy }
}
function checkOutLoc(loc: LocationInput) {
  if (!loc) return {}
  if ('denied' in loc) return { checkOutLocationDenied: true }
  return { checkOutLat: loc.lat, checkOutLng: loc.lng, checkOutAccuracy: loc.accuracy }
}

export interface TodayState {
  open: { id: string; checkIn: Date } | null
  entries: { id: string; checkIn: Date; checkOut: Date | null }[]
  nextAction: 'entrada' | 'salida'
}

/** Estado real del día para el botón: hay fichada abierta → toca "salida". */
export async function todayStateFor(db: Db, employeeId: string, now: Date): Promise<TodayState> {
  const workDate = workDateOf(now)
  const [open, entries] = await Promise.all([
    db.timeEntry.findFirst({
      where: { employeeId, checkOut: null, deletedAt: null },
      orderBy: { checkIn: 'desc' },
      select: { id: true, checkIn: true },
    }),
    db.timeEntry.findMany({
      where: { employeeId, workDate, deletedAt: null },
      orderBy: { checkIn: 'asc' },
      select: { id: true, checkIn: true, checkOut: true },
    }),
  ])
  return { open, entries, nextAction: open ? 'salida' : 'entrada' }
}

interface ClockArgs {
  employeeId: string
  actorId: string
  source: 'DEVICE' | 'MANUAL'
  editedById?: string | null
  location: LocationInput
}

/**
 * Fichar ENTRADA. `now` lo pone SIEMPRE el servidor (la action pasa new Date()),
 * jamás el cliente: si viniera del celular, cambiar el reloj permitiría
 * autofichar. Nunca deja dos entradas abiertas.
 */
export async function clockIn(db: Db, args: ClockArgs, now: Date): Promise<string> {
  const already = await db.timeEntry.findFirst({
    where: { employeeId: args.employeeId, checkOut: null, deletedAt: null },
    select: { id: true },
  })
  if (already) throw new ActionError('CONFLICT', 'Ya tenés una fichada de entrada abierta.')

  const workDate = workDateOf(now)
  const e = await db.timeEntry.create({
    data: {
      employeeId: args.employeeId,
      workDate,
      checkIn: now,
      source: args.source,
      editedById: args.editedById ?? null,
      ...checkInLoc(args.location),
    },
    select: { id: true },
  })
  await recalculate(db, args.employeeId, workDate, args.actorId)
  return e.id
}

/** Fichar SALIDA: cierra la entrada abierta con la hora del servidor. */
export async function clockOut(
  db: Db,
  args: Omit<ClockArgs, 'source'>,
  now: Date,
): Promise<void> {
  const open = await db.timeEntry.findFirst({
    where: { employeeId: args.employeeId, checkOut: null, deletedAt: null },
    orderBy: { checkIn: 'desc' },
    select: { id: true, workDate: true, checkIn: true },
  })
  if (!open) throw new ActionError('CONFLICT', 'No tenés una fichada de entrada abierta.')
  if (now <= open.checkIn) throw new ActionError('VALIDATION', 'La salida no puede ser anterior a la entrada.')

  await db.timeEntry.update({
    where: { id: open.id },
    data: {
      checkOut: now,
      ...(args.editedById ? { editedById: args.editedById } : {}),
      ...checkOutLoc(args.location),
    },
  })
  await recalculate(db, args.employeeId, open.workDate, args.actorId)
}

/** Alterna entrada/salida según el estado actual (usado por el supervisor). */
export async function clockToggle(db: Db, args: ClockArgs, now: Date): Promise<'entrada' | 'salida'> {
  const open = await db.timeEntry.findFirst({
    where: { employeeId: args.employeeId, checkOut: null, deletedAt: null },
    select: { id: true },
  })
  if (open) {
    await clockOut(db, args, now)
    return 'salida'
  }
  await clockIn(db, args, now)
  return 'entrada'
}

// ── Supervisor: fichaje del grupo, solo en eventos que supervisa ──

async function assertSupervises(db: Db, supervisorEmployeeId: string, eventId: string): Promise<void> {
  const ok = await canSupervisorAccessEvent(db, supervisorEmployeeId, eventId)
  if (!ok) throw new ActionError('FORBIDDEN', 'No sos supervisor de este evento.')
}

export async function supervisorToggle(
  db: Db,
  args: {
    supervisorEmployeeId: string
    supervisorUserId: string
    eventId: string
    memberEmployeeId: string
    location: LocationInput
  },
  now: Date,
): Promise<'entrada' | 'salida'> {
  await assertSupervises(db, args.supervisorEmployeeId, args.eventId)
  return clockToggle(
    db,
    {
      employeeId: args.memberEmployeeId,
      actorId: args.supervisorUserId,
      source: 'MANUAL',
      editedById: args.supervisorUserId,
      location: args.location,
    },
    now,
  )
}

/** Fichada RETROACTIVA con hora explícita (caso "no había señal"): editedById =
 *  supervisor, source MANUAL, auditada por el recálculo. */
export async function supervisorRetroactive(
  db: Db,
  args: {
    supervisorEmployeeId: string
    supervisorUserId: string
    eventId: string
    memberEmployeeId: string
    checkIn: Date
    checkOut: Date
  },
): Promise<string> {
  await assertSupervises(db, args.supervisorEmployeeId, args.eventId)
  if (args.checkOut <= args.checkIn) throw new ActionError('VALIDATION', 'La salida debe ser posterior a la entrada.')

  const workDate = workDateOf(args.checkIn)
  const e = await db.timeEntry.create({
    data: {
      employeeId: args.memberEmployeeId,
      workDate,
      checkIn: args.checkIn,
      checkOut: args.checkOut,
      source: 'MANUAL',
      editedById: args.supervisorUserId,
    },
    select: { id: true },
  })
  await recalculate(db, args.memberEmployeeId, workDate, args.supervisorUserId)
  return e.id
}

// ── Correcciones del admin ──

async function writeTimeEntryAudit(
  tx: Tx,
  args: { id: string; action: string; actorId: string; before: unknown; after: unknown },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      domain: 'ATTENDANCE',
      action: args.action,
      entityType: 'TimeEntry',
      entityId: args.id,
      before: args.before === null ? Prisma.DbNull : (args.before as Prisma.InputJsonValue),
      after: args.after === null ? Prisma.DbNull : (args.after as Prisma.InputJsonValue),
      actorId: args.actorId,
    },
  })
}

/** Editar una fichada a mano (o cerrar una abierta). source=MANUAL, editedById. */
export async function adminEditTimeEntry(
  db: Db,
  id: string,
  data: { checkIn: Date; checkOut: Date | null },
  actorId: string,
): Promise<void> {
  const existing = await db.timeEntry.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, employeeId: true, workDate: true, checkIn: true, checkOut: true },
  })
  if (!existing) throw new ActionError('NOT_FOUND', 'Fichada no encontrada.')
  if (data.checkOut && data.checkOut <= data.checkIn) {
    throw new ActionError('VALIDATION', 'La salida debe ser posterior a la entrada.')
  }
  const workDate = workDateOf(data.checkIn)

  await db.$transaction(async (tx) => {
    await tx.timeEntry.update({
      where: { id },
      data: { checkIn: data.checkIn, checkOut: data.checkOut, workDate, source: 'MANUAL', editedById: actorId },
    })
    await writeTimeEntryAudit(tx, {
      id,
      action: 'edit',
      actorId,
      before: { checkIn: existing.checkIn, checkOut: existing.checkOut },
      after: { checkIn: data.checkIn, checkOut: data.checkOut },
    })
  })

  // Recalcula el día viejo y el nuevo (por si cambió la fecha).
  const seen = new Set<string>()
  for (const wd of [existing.workDate, workDate]) {
    const k = dateKey(wd)
    if (seen.has(k)) continue
    seen.add(k)
    await recalculate(db, existing.employeeId, wd, actorId)
  }
}

export async function adminDeleteTimeEntry(db: Db, id: string, actorId: string): Promise<void> {
  const existing = await db.timeEntry.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, employeeId: true, workDate: true },
  })
  if (!existing) throw new ActionError('NOT_FOUND', 'Fichada no encontrada.')
  await db.$transaction(async (tx) => {
    await tx.timeEntry.update({ where: { id }, data: { deletedAt: new Date() } })
    await writeTimeEntryAudit(tx, { id, action: 'delete', actorId, before: null, after: { deletedAt: 'set' } })
  })
  await recalculate(db, existing.employeeId, existing.workDate, actorId)
}

/**
 * Marca un día con un status MANUAL (p.ej. JUSTIFIED). El recálculo posterior
 * PRESERVA el status manual pero refresca workedMinutes/warnings.
 */
export async function adminSetManualStatus(
  db: Db,
  args: { employeeId: string; workDate: Date; status: 'JUSTIFIED' | 'PRESENT' | 'ABSENT'; actorId: string },
): Promise<void> {
  await db.attendance.upsert({
    where: { employeeId_workDate: { employeeId: args.employeeId, workDate: args.workDate } },
    create: { employeeId: args.employeeId, workDate: args.workDate, status: args.status, source: 'MANUAL' },
    update: { status: args.status, source: 'MANUAL' },
  })
  // Refresca derivados conservando el status manual.
  await recalculate(db, args.employeeId, args.workDate, args.actorId)
}

/** Recálculo puntual de un día (botón del admin). */
export async function adminRecalcDay(
  db: Db,
  employeeId: string,
  workDate: Date,
  actorId: string,
): Promise<void> {
  await recalculate(db, employeeId, workDate, actorId)
}
