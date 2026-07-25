import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { prisma } from '@/lib/db'
import { workDateFromKey } from '@/lib/attendance/timezone'
import { registerClientPayment, registerExpense, payExpense, deleteMovement } from '@/lib/finance/cash'
import { buildEventProfit, cashBalance, totalReceivable, totalPayable } from '@/lib/finance/profit'
import { getAbsentDeductionCents, setAbsentDeductionCents } from '@/lib/payroll/settings'

const ACTOR = 'admin-user-id'
const D = (k: string) => workDateFromKey(k)
const DAY = '2026-09-10'

async function clean() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE cash_movement, expense, party, payroll_config, "user", employee, event, audit_log RESTART IDENTITY CASCADE',
  )
}

async function mkEvent(agreedCents: bigint | null) {
  return prisma.event.create({
    data: { name: 'Ev', startAt: new Date('2026-09-10T12:00:00Z'), endAt: new Date('2026-09-10T20:00:00Z'), status: 'CONFIRMED', agreedCents },
    select: { id: true },
  })
}

beforeEach(async () => {
  await clean()
  await prisma.user.create({ data: { id: ACTOR, email: 'a@t.com', name: 'A', role: 'ADMIN' } })
})
afterAll(async () => {
  await prisma.$disconnect()
})

describe('finanzas — orquestación', () => {
  it('el costo del evento cuenta lo COMPROMETIDO (PENDING + PAID)', async () => {
    const ev = await mkEvent(100_000_000n)
    await registerExpense(prisma, { description: 'Transporte', amountCents: 30_000_000n, incurredOn: D(DAY), category: 'TRANSPORT', eventId: ev.id }, ACTOR) // PENDING
    await registerExpense(prisma, { description: 'Equipos', amountCents: 20_000_000n, incurredOn: D(DAY), category: 'EQUIPMENT', eventId: ev.id, pay: { occurredOn: D(DAY) } }, ACTOR) // PAID

    const fin = await buildEventProfit(prisma, ev.id)
    expect(fin!.costCents).toBe(50_000_000n) // 30 PENDING + 20 PAID
    expect(fin!.profit.profitCents).toBe(50_000_000n) // 100 − 50
    expect(fin!.profit.marginPct).toBe(50)
  })

  it('pago de cliente: mueve caja y baja el pendiente; la rentabilidad usa PACTADO', async () => {
    const ev = await mkEvent(100_000_000n)
    await registerClientPayment(prisma, { eventId: ev.id, amountCents: 40_000_000n, occurredOn: D(DAY) }, ACTOR)

    const fin = await buildEventProfit(prisma, ev.id)
    expect(fin!.paidCents).toBe(40_000_000n)
    expect(fin!.pendingCents).toBe(60_000_000n)
    expect(fin!.profit.profitCents).toBe(100_000_000n) // usa pactado (sin gastos), NO lo cobrado
  })

  it('gasto PENDING no mueve caja; pagado al toque sí', async () => {
    const ev = await mkEvent(null)
    await registerExpense(prisma, { description: 'A futuro', amountCents: 30_000_000n, incurredOn: D(DAY), category: 'OTHER', eventId: ev.id }, ACTOR)
    expect(await cashBalance(prisma)).toBe(0n) // PENDING: caja intacta
    expect(await totalPayable(prisma)).toBe(30_000_000n)

    await registerExpense(prisma, { description: 'Al toque', amountCents: 20_000_000n, incurredOn: D(DAY), category: 'OTHER', pay: { occurredOn: D(DAY) } }, ACTOR)
    expect(await cashBalance(prisma)).toBe(-20_000_000n) // PAID: salió de caja
  })

  it('pagar un Expense PENDING: crea el egreso y lo pasa a PAID', async () => {
    const ev = await mkEvent(null)
    const id = await registerExpense(prisma, { description: 'Proveedor', amountCents: 30_000_000n, incurredOn: D(DAY), category: 'SUPPLIES', eventId: ev.id }, ACTOR)
    expect(await totalPayable(prisma)).toBe(30_000_000n)

    await payExpense(prisma, id, D(DAY), ACTOR)
    expect(await totalPayable(prisma)).toBe(0n)
    expect(await cashBalance(prisma)).toBe(-30_000_000n)
    const exp = await prisma.expense.findFirstOrThrow({ where: { id } })
    expect(exp.status).toBe('PAID')
  })

  it('anular un pago de cliente: el pendiente vuelve solo, sin plata fantasma', async () => {
    const ev = await mkEvent(100_000_000n)
    const mvId = await registerClientPayment(prisma, { eventId: ev.id, amountCents: 40_000_000n, occurredOn: D(DAY) }, ACTOR)
    expect((await buildEventProfit(prisma, ev.id))!.pendingCents).toBe(60_000_000n)

    await deleteMovement(prisma, mvId, ACTOR)
    const fin = await buildEventProfit(prisma, ev.id)
    expect(fin!.paidCents).toBe(0n) // el INCOME borrado no cuenta
    expect(fin!.pendingCents).toBe(100_000_000n) // derivado: vuelve al total
    expect(await cashBalance(prisma)).toBe(0n)
  })

  it('anular el pago de un gasto: el gasto vuelve a PENDING', async () => {
    const id = await registerExpense(prisma, { description: 'X', amountCents: 20_000_000n, incurredOn: D(DAY), category: 'OTHER', pay: { occurredOn: D(DAY) } }, ACTOR)
    const mv = await prisma.cashMovement.findFirstOrThrow({ where: { expenseId: id, deletedAt: null }, select: { id: true } })
    await deleteMovement(prisma, mv.id, ACTOR)

    const exp = await prisma.expense.findFirstOrThrow({ where: { id } })
    expect(exp.status).toBe('PENDING') // volvió a deber
    expect(await cashBalance(prisma)).toBe(0n)
    expect(await totalPayable(prisma)).toBe(20_000_000n)
  })

  it('derivados: saldo, por cobrar, por pagar', async () => {
    const ev = await mkEvent(100_000_000n)
    await registerClientPayment(prisma, { eventId: ev.id, amountCents: 40_000_000n, occurredOn: D(DAY) }, ACTOR) // caja +40
    await registerExpense(prisma, { description: 'pag', amountCents: 30_000_000n, incurredOn: D(DAY), category: 'OTHER', pay: { occurredOn: D(DAY) } }, ACTOR) // caja −30
    await registerExpense(prisma, { description: 'deuda', amountCents: 25_000_000n, incurredOn: D(DAY), category: 'OTHER' }, ACTOR) // PENDING

    expect(await cashBalance(prisma)).toBe(10_000_000n) // 40 − 30
    expect(await totalReceivable(prisma)).toBe(60_000_000n) // 100 pactado − 40 cobrado
    expect(await totalPayable(prisma)).toBe(25_000_000n)
  })

  it('config del descuento: versionado, el vigente cambia y audita', async () => {
    expect(await getAbsentDeductionCents(prisma)).toBeNull()
    await setAbsentDeductionCents(prisma, 3_000_000n, D('2026-01-01'), ACTOR)
    expect(await getAbsentDeductionCents(prisma)).toBe(3_000_000n)

    await setAbsentDeductionCents(prisma, 4_000_000n, D('2026-09-01'), ACTOR)
    expect(await getAbsentDeductionCents(prisma)).toBe(4_000_000n) // nuevo vigente
    expect(await prisma.payrollConfig.count({ where: { effectiveTo: null, deletedAt: null } })).toBe(1) // uno solo vigente
    expect(await prisma.auditLog.count({ where: { domain: 'PAYROLL', action: 'config-change' } })).toBe(2)
  })
})
