import type { PrismaClient, PartyKind } from '@/generated/prisma/client'
import { ActionError } from '@/lib/auth/action'
import { writeCashAudit } from './audit'

type Db = PrismaClient

/** Nombre único entre los activos por kind (índice parcial). findFirst, no findUnique. */
async function assertNameFree(db: Db, name: string, kind: PartyKind, exceptId?: string): Promise<void> {
  const clash = await db.party.findFirst({ where: { name, kind, deletedAt: null, ...(exceptId ? { NOT: { id: exceptId } } : {}) }, select: { id: true } })
  if (clash) throw new ActionError('CONFLICT', `Ya existe un ${kind === 'CLIENT' ? 'cliente' : 'proveedor'} activo con ese nombre.`)
}

export async function createParty(db: Db, args: { name: string; kind: PartyKind; notes?: string }, actorId: string): Promise<string> {
  const name = args.name.trim()
  if (!name) throw new ActionError('VALIDATION', 'El nombre es obligatorio.')
  await assertNameFree(db, name, args.kind)
  return db.$transaction(async (tx) => {
    const p = await tx.party.create({ data: { name, kind: args.kind, notes: args.notes?.trim() || null }, select: { id: true } })
    await writeCashAudit(tx, { action: 'party-create', entityType: 'Party', entityId: p.id, before: null, after: { name, kind: args.kind }, actorId })
    return p.id
  })
}

export async function updateParty(db: Db, id: string, args: { name: string; notes?: string }, actorId: string): Promise<void> {
  const existing = await db.party.findFirst({ where: { id, deletedAt: null }, select: { id: true, name: true, kind: true } })
  if (!existing) throw new ActionError('NOT_FOUND', 'No encontrado.')
  const name = args.name.trim()
  if (!name) throw new ActionError('VALIDATION', 'El nombre es obligatorio.')
  if (name !== existing.name) await assertNameFree(db, name, existing.kind, id)
  await db.$transaction(async (tx) => {
    await tx.party.update({ where: { id }, data: { name, notes: args.notes?.trim() || null } })
    await writeCashAudit(tx, { action: 'party-update', entityType: 'Party', entityId: id, before: { name: existing.name }, after: { name }, actorId })
  })
}

/** Soft-delete. Las referencias existentes (event.clientId, expense.providerId) se conservan. */
export async function deleteParty(db: Db, id: string, actorId: string): Promise<void> {
  const existing = await db.party.findFirst({ where: { id, deletedAt: null }, select: { id: true } })
  if (!existing) throw new ActionError('NOT_FOUND', 'No encontrado.')
  await db.$transaction(async (tx) => {
    await tx.party.update({ where: { id }, data: { deletedAt: new Date() } })
    await writeCashAudit(tx, { action: 'party-delete', entityType: 'Party', entityId: id, before: null, after: { deletedAt: 'set' }, actorId })
  })
}

export async function listParties(db: Db, kind?: PartyKind) {
  return db.party.findMany({
    where: { deletedAt: null, ...(kind ? { kind } : {}) },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, kind: true, notes: true },
  })
}

/** Precio pactado + cliente del evento (la cuenta por cobrar). Auditado. */
export async function setEventPrice(db: Db, eventId: string, args: { agreedCents: bigint | null; clientId: string | null }, actorId: string): Promise<void> {
  if (args.agreedCents !== null && args.agreedCents < 0n) throw new ActionError('VALIDATION', 'El precio no puede ser negativo.')
  const event = await db.event.findFirst({ where: { id: eventId, deletedAt: null }, select: { id: true, agreedCents: true } })
  if (!event) throw new ActionError('NOT_FOUND', 'Evento no encontrado.')
  await db.$transaction(async (tx) => {
    await tx.event.update({ where: { id: eventId }, data: { agreedCents: args.agreedCents, clientId: args.clientId } })
    await writeCashAudit(tx, {
      action: 'event-price',
      entityType: 'Event',
      entityId: eventId,
      before: { agreedCents: event.agreedCents?.toString() ?? null },
      after: { agreedCents: args.agreedCents?.toString() ?? null, clientId: args.clientId },
      actorId,
    })
  })
}
