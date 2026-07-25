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

/** Un party con sus agregados para la lista gestionable. `count` = eventos (CLIENT) o
 *  gastos (PROVIDER) vinculados; `pendingCents` = por cobrar (CLIENT) o por pagar (PROVIDER). */
export interface PartyWithStats {
  id: string
  name: string
  notes: string | null
  count: number
  pendingCents: bigint
}

/** Clientes con: cantidad de eventos asignados + Σ pendiente de cobro. Bulk, sin N+1. */
export async function listClientsWithStats(db: Db): Promise<PartyWithStats[]> {
  const clients = await db.party.findMany({ where: { kind: 'CLIENT', deletedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true, notes: true } })
  if (clients.length === 0) return []
  const events = await db.event.findMany({ where: { deletedAt: null, clientId: { in: clients.map((c) => c.id) } }, select: { id: true, clientId: true, agreedCents: true } })
  const paid = events.length
    ? await db.cashMovement.groupBy({ by: ['eventId'], where: { eventId: { in: events.map((e) => e.id) }, direction: 'INCOME', deletedAt: null }, _sum: { amountCents: true } })
    : []
  const paidBy = new Map<string, bigint>()
  for (const p of paid) if (p.eventId) paidBy.set(p.eventId, p._sum.amountCents ?? 0n)
  const countBy = new Map<string, number>()
  const pendBy = new Map<string, bigint>()
  for (const e of events) {
    if (!e.clientId) continue
    countBy.set(e.clientId, (countBy.get(e.clientId) ?? 0) + 1)
    const pend = (e.agreedCents ?? 0n) - (paidBy.get(e.id) ?? 0n)
    if (pend > 0n) pendBy.set(e.clientId, (pendBy.get(e.clientId) ?? 0n) + pend)
  }
  return clients.map((c) => ({ id: c.id, name: c.name, notes: c.notes, count: countBy.get(c.id) ?? 0, pendingCents: pendBy.get(c.id) ?? 0n }))
}

/** Proveedores con: cantidad de gastos vinculados + Σ por pagar (Expenses PENDING). Bulk, sin N+1. */
export async function listProvidersWithStats(db: Db): Promise<PartyWithStats[]> {
  const providers = await db.party.findMany({ where: { kind: 'PROVIDER', deletedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true, notes: true } })
  if (providers.length === 0) return []
  const ids = providers.map((p) => p.id)
  const [counts, pend] = await Promise.all([
    db.expense.groupBy({ by: ['providerId'], where: { providerId: { in: ids }, deletedAt: null }, _count: { _all: true } }),
    db.expense.groupBy({ by: ['providerId'], where: { providerId: { in: ids }, deletedAt: null, status: 'PENDING' }, _sum: { amountCents: true } }),
  ])
  const countBy = new Map<string, number>()
  for (const c of counts) if (c.providerId) countBy.set(c.providerId, c._count._all)
  const pendBy = new Map<string, bigint>()
  for (const p of pend) if (p.providerId) pendBy.set(p.providerId, p._sum.amountCents ?? 0n)
  return providers.map((p) => ({ id: p.id, name: p.name, notes: p.notes, count: countBy.get(p.id) ?? 0, pendingCents: pendBy.get(p.id) ?? 0n }))
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
