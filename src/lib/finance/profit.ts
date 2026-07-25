import type { PrismaClient } from '@/generated/prisma/client'
import { computeEventProfit, type EventProfit } from '@/lib/domain/finance'

/**
 * Caller de rentabilidad + derivados de caja. Trae de la DB y arma el input plano
 * para computeEventProfit. Queries en BULK (sin N+1). BigInt PURO: ningún monto
 * toca Number (los _sum de Prisma sobre BigInt devuelven BigInt; el único Number
 * está en marginPct, adentro de la función pura).
 *
 * DECISIÓN: el costo del evento = Σ Expenses COMPROMETIDOS (status PENDING + PAID).
 * El gasto es costo desde que se registra, esté pagado o no — simétrico con el
 * ingreso, que usa lo PACTADO (no lo cobrado).
 */

type Db = PrismaClient

export interface EventFinance {
  eventId: string
  name: string
  agreedCents: bigint | null
  clientId: string | null // cliente asignado al evento (para pre-cargar el form de precio sin borrarlo)
  costCents: bigint // Σ Expenses (PENDING + PAID) imputados
  paidCents: bigint // Σ INCOME movements del evento (cobrado)
  pendingCents: bigint // por cobrar = max(0, pactado − cobrado)
  profit: EventProfit // computeEventProfit(pactado, costo)
}

function toMap(rows: { eventId: string | null; _sum: { amountCents: bigint | null } }[]): Map<string, bigint> {
  const m = new Map<string, bigint>()
  for (const r of rows) if (r.eventId) m.set(r.eventId, r._sum.amountCents ?? 0n)
  return m
}

function assemble(event: { id: string; name: string; agreedCents: bigint | null; clientId: string | null }, costCents: bigint, paidCents: bigint): EventFinance {
  const pending = (event.agreedCents ?? 0n) - paidCents
  return {
    eventId: event.id,
    name: event.name,
    agreedCents: event.agreedCents,
    clientId: event.clientId,
    costCents,
    paidCents,
    pendingCents: pending > 0n ? pending : 0n,
    profit: computeEventProfit({ agreedCents: event.agreedCents, costCents }),
  }
}

/** Rentabilidad + cobranza de UN evento. */
export async function buildEventProfit(db: Db, eventId: string): Promise<EventFinance | null> {
  const event = await db.event.findFirst({ where: { id: eventId, deletedAt: null }, select: { id: true, name: true, agreedCents: true, clientId: true } })
  if (!event) return null
  const [cost, paid] = await Promise.all([
    db.expense.aggregate({ where: { eventId, deletedAt: null }, _sum: { amountCents: true } }),
    db.cashMovement.aggregate({ where: { eventId, direction: 'INCOME', deletedAt: null }, _sum: { amountCents: true } }),
  ])
  return assemble(event, cost._sum.amountCents ?? 0n, paid._sum.amountCents ?? 0n)
}

/** Rentabilidad de TODOS los eventos (para el reporte). Bulk, sin N+1. */
export async function listEventProfits(db: Db, opts?: { eventIds?: string[] }): Promise<EventFinance[]> {
  const events = await db.event.findMany({
    where: { deletedAt: null, ...(opts?.eventIds ? { id: { in: opts.eventIds } } : {}) },
    orderBy: { startAt: 'desc' },
    select: { id: true, name: true, agreedCents: true, clientId: true },
  })
  if (events.length === 0) return []
  const ids = events.map((e) => e.id)
  const [costs, incomes] = await Promise.all([
    db.expense.groupBy({ by: ['eventId'], where: { eventId: { in: ids }, deletedAt: null }, _sum: { amountCents: true } }),
    db.cashMovement.groupBy({ by: ['eventId'], where: { eventId: { in: ids }, direction: 'INCOME', deletedAt: null }, _sum: { amountCents: true } }),
  ])
  const costBy = toMap(costs)
  const paidBy = toMap(incomes)
  return events.map((e) => assemble(e, costBy.get(e.id) ?? 0n, paidBy.get(e.id) ?? 0n))
}

// ── Derivados de caja (BigInt puro) ──

/** Saldo actual de caja = Σ INCOME − Σ EXPENSE (movimientos no borrados). */
export async function cashBalance(db: Db): Promise<bigint> {
  const [inc, exp] = await Promise.all([
    db.cashMovement.aggregate({ where: { direction: 'INCOME', deletedAt: null }, _sum: { amountCents: true } }),
    db.cashMovement.aggregate({ where: { direction: 'EXPENSE', deletedAt: null }, _sum: { amountCents: true } }),
  ])
  return (inc._sum.amountCents ?? 0n) - (exp._sum.amountCents ?? 0n)
}

/** Por cobrar total = Σ por evento de max(0, pactado − cobrado). */
export async function totalReceivable(db: Db): Promise<bigint> {
  const events = await db.event.findMany({ where: { deletedAt: null, agreedCents: { not: null } }, select: { id: true, agreedCents: true } })
  if (events.length === 0) return 0n
  const paid = await db.cashMovement.groupBy({
    by: ['eventId'],
    where: { eventId: { in: events.map((e) => e.id) }, direction: 'INCOME', deletedAt: null },
    _sum: { amountCents: true },
  })
  const paidBy = toMap(paid)
  let total = 0n
  for (const e of events) {
    const pend = (e.agreedCents ?? 0n) - (paidBy.get(e.id) ?? 0n)
    if (pend > 0n) total += pend
  }
  return total
}

/** Por pagar total = Σ Expenses PENDING (no borrados). */
export async function totalPayable(db: Db): Promise<bigint> {
  const r = await db.expense.aggregate({ where: { status: 'PENDING', deletedAt: null }, _sum: { amountCents: true } })
  return r._sum.amountCents ?? 0n
}
