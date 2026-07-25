import type { PrismaClient } from '@/generated/prisma/client'
import { monthBounds } from '@/lib/payroll/build-input'
import { cashBalance, totalReceivable, totalPayable, listEventProfits, type EventFinance } from './profit'

/** Lecturas para la UI de finanzas. Montos en BigInt; el borde formatea a pesos. */

type Db = PrismaClient

export interface MovementRow {
  id: string
  direction: 'INCOME' | 'EXPENSE'
  amountCents: bigint
  occurredOn: Date
  category: string
  concept: string // evento / gasto / nota
}

export async function listMovements(db: Db, opts?: { fromKey?: string; toKey?: string; direction?: 'INCOME' | 'EXPENSE' }): Promise<MovementRow[]> {
  const rows = await db.cashMovement.findMany({
    where: {
      deletedAt: null,
      ...(opts?.direction ? { direction: opts.direction } : {}),
      ...(opts?.fromKey || opts?.toKey
        ? { occurredOn: { ...(opts.fromKey ? { gte: new Date(`${opts.fromKey}T00:00:00Z`) } : {}), ...(opts.toKey ? { lte: new Date(`${opts.toKey}T00:00:00Z`) } : {}) } }
        : {}),
    },
    orderBy: [{ occurredOn: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, direction: true, amountCents: true, occurredOn: true, category: true, note: true, event: { select: { name: true } }, expense: { select: { description: true } } },
  })
  return rows.map((r) => ({
    id: r.id,
    direction: r.direction,
    amountCents: r.amountCents,
    occurredOn: r.occurredOn,
    category: r.category,
    concept: r.event?.name ?? r.expense?.description ?? r.note ?? '—',
  }))
}

export interface PayableRow {
  id: string
  description: string
  amountCents: bigint
  incurredOn: Date
  category: string
  providerName: string | null
  eventName: string | null
}

export async function listPayables(db: Db): Promise<PayableRow[]> {
  const rows = await db.expense.findMany({
    where: { status: 'PENDING', deletedAt: null },
    orderBy: { incurredOn: 'asc' },
    select: { id: true, description: true, amountCents: true, incurredOn: true, category: true, provider: { select: { name: true } }, event: { select: { name: true } } },
  })
  return rows.map((r) => ({ id: r.id, description: r.description, amountCents: r.amountCents, incurredOn: r.incurredOn, category: r.category, providerName: r.provider?.name ?? null, eventName: r.event?.name ?? null }))
}

/** Cuentas por cobrar: eventos con precio pactado, con su cobrado/pendiente. */
export async function listReceivables(db: Db): Promise<EventFinance[]> {
  const all = await listEventProfits(db)
  return all.filter((e) => e.agreedCents !== null)
}

export interface MonthSummary {
  year: number
  month: number
  inCents: bigint
  outCents: bigint
  resultCents: bigint
  saldoCents: bigint
  receivableCents: bigint
  payableCents: bigint
  eventProfits: EventFinance[]
}

export async function monthSummary(db: Db, year: number, month: number): Promise<MonthSummary> {
  const m = monthBounds(year, month)
  const from = new Date(`${m.startKey}T00:00:00Z`)
  const to = new Date(`${m.endKey}T00:00:00Z`)
  const [inc, out, saldo, recv, pay, profits] = await Promise.all([
    db.cashMovement.aggregate({ where: { direction: 'INCOME', deletedAt: null, occurredOn: { gte: from, lte: to } }, _sum: { amountCents: true } }),
    db.cashMovement.aggregate({ where: { direction: 'EXPENSE', deletedAt: null, occurredOn: { gte: from, lte: to } }, _sum: { amountCents: true } }),
    cashBalance(db),
    totalReceivable(db),
    totalPayable(db),
    listEventProfits(db),
  ])
  const inCents = inc._sum.amountCents ?? 0n
  const outCents = out._sum.amountCents ?? 0n
  return {
    year,
    month,
    inCents,
    outCents,
    resultCents: inCents - outCents,
    saldoCents: saldo,
    receivableCents: recv,
    payableCents: pay,
    eventProfits: profits.filter((e) => e.agreedCents !== null || e.costCents > 0n),
  }
}
