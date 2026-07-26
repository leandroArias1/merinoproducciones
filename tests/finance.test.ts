import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { prisma } from '@/lib/db'
import { workDateFromKey, dateKey } from '@/lib/attendance/timezone'
import { registerClientPayment, registerExpense, payExpense, deleteMovement } from '@/lib/finance/cash'
import { buildEventProfit, cashBalance, totalReceivable, totalPayable } from '@/lib/finance/profit'
import { createParty, setEventPrice, listClientsWithStats, listProvidersWithStats } from '@/lib/finance/party'
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

  it('editar solo el precio de un evento CONSERVA el cliente (bug de pérdida de dato)', async () => {
    const clientId = await createParty(prisma, { name: 'Cliente A', kind: 'CLIENT' }, ACTOR)
    const ev = await mkEvent(null)
    await setEventPrice(prisma, ev.id, { agreedCents: 100_000_000n, clientId }, ACTOR)
    expect((await buildEventProfit(prisma, ev.id))!.clientId).toBe(clientId)

    // Re-cargar SOLO el precio, re-pasando el cliente actual (lo que ahora hace el form).
    await setEventPrice(prisma, ev.id, { agreedCents: 150_000_000n, clientId }, ACTOR)
    const fin = await buildEventProfit(prisma, ev.id)
    expect(fin!.agreedCents).toBe(150_000_000n)
    expect(fin!.clientId).toBe(clientId) // ← se conserva

    // Documenta el modo destructivo: pasar clientId null lo borra. Por eso el form
    // DEBE pre-cargar currentClientId; si no, guardar precio dejaba el evento sin cliente.
    await setEventPrice(prisma, ev.id, { agreedCents: 150_000_000n, clientId: null }, ACTOR)
    expect((await buildEventProfit(prisma, ev.id))!.clientId).toBeNull()
  })

  it('listClientsWithStats: eventos vinculados + pendiente; el cliente sin evento aparece en cero', async () => {
    const conEvento = await createParty(prisma, { name: 'Con evento', kind: 'CLIENT' }, ACTOR)
    const sinEvento = await createParty(prisma, { name: 'Sin evento', kind: 'CLIENT' }, ACTOR)
    const ev = await mkEvent(100_000_000n)
    await setEventPrice(prisma, ev.id, { agreedCents: 100_000_000n, clientId: conEvento }, ACTOR)
    await registerClientPayment(prisma, { eventId: ev.id, amountCents: 40_000_000n, occurredOn: D(DAY) }, ACTOR)

    const stats = await listClientsWithStats(prisma)
    const a = stats.find((s) => s.id === conEvento)!
    const b = stats.find((s) => s.id === sinEvento)!
    expect(a.count).toBe(1)
    expect(a.pendingCents).toBe(60_000_000n) // 100 pactado − 40 cobrado
    expect(b.count).toBe(0) // aparece igual...
    expect(b.pendingCents).toBe(0n) // ...en cero (el bug era que no aparecía)
  })

  it('listProvidersWithStats: gastos vinculados + por pagar; el proveedor sin gasto aparece en cero', async () => {
    const conGasto = await createParty(prisma, { name: 'Con gasto', kind: 'PROVIDER' }, ACTOR)
    const sinGasto = await createParty(prisma, { name: 'Sin gasto', kind: 'PROVIDER' }, ACTOR)
    await registerExpense(prisma, { description: 'Deuda', amountCents: 25_000_000n, incurredOn: D(DAY), category: 'SUPPLIES', providerId: conGasto }, ACTOR) // PENDING
    await registerExpense(prisma, { description: 'Pagado', amountCents: 10_000_000n, incurredOn: D(DAY), category: 'SUPPLIES', providerId: conGasto, pay: { occurredOn: D(DAY) } }, ACTOR) // PAID

    const stats = await listProvidersWithStats(prisma)
    const a = stats.find((s) => s.id === conGasto)!
    const b = stats.find((s) => s.id === sinGasto)!
    expect(a.count).toBe(2) // ambos gastos vinculados
    expect(a.pendingCents).toBe(25_000_000n) // solo el PENDING cuenta como por pagar
    expect(b.count).toBe(0)
    expect(b.pendingCents).toBe(0n)
  })

  it('config: con DOS vigentes (índice caído) devuelve el más reciente, no uno al azar', async () => {
    // El índice payroll_config_vigente_uq impide este estado. Se lo baja a
    // propósito para probar la defensa en profundidad: si algún día ese índice
    // no estuviera (una base nueva mal armada), la lectura tiene que seguir
    // siendo DETERMINISTA. Sin orderBy, Postgres puede devolver cualquiera de
    // las dos filas y el descuento por falta "cambia solo" entre consultas.
    await prisma.$executeRawUnsafe('DROP INDEX IF EXISTS payroll_config_vigente_uq')
    try {
      const ins = (id: string, cents: number, from: string) =>
        prisma.$executeRawUnsafe(
          `INSERT INTO payroll_config (id,"absentDeductionCents","effectiveFrom","createdAt","updatedAt") VALUES ($1,$2,$3,now(),now())`,
          id,
          cents,
          new Date(`${from}T00:00:00.000Z`),
        )
      // Se inserta el VIEJO último a propósito: si la lectura dependiera del
      // orden físico de inserción, devolvería éste y el test fallaría.
      await ins('cfg-nuevo', 4_000_000, '2026-09-10')
      await ins('cfg-viejo', 3_000_000, '2026-01-01')

      expect(await prisma.payrollConfig.count({ where: { effectiveTo: null, deletedAt: null } })).toBe(2)
      expect(await getAbsentDeductionCents(prisma)).toBe(4_000_000n) // el más reciente

      // Y al versionar se pisa el más reciente, no el viejo.
      await setAbsentDeductionCents(prisma, 4_500_000n, workDateFromKey('2026-09-10'), ACTOR)
      expect(await getAbsentDeductionCents(prisma)).toBe(4_500_000n)
      const viejo = await prisma.payrollConfig.findFirstOrThrow({ where: { id: 'cfg-viejo' } })
      expect(viejo.absentDeductionCents).toBe(3_000_000n) // intacto
    } finally {
      await prisma.$executeRawUnsafe('DELETE FROM payroll_config')
      await prisma.$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS payroll_config_vigente_uq ON payroll_config ((true)) WHERE "effectiveTo" IS NULL AND "deletedAt" IS NULL`,
      )
    }
  })

  it('config: cambiar el descuento el MISMO día que se cargó el vigente NO viola el CHECK', async () => {
    const HOY = D('2026-09-10')
    await setAbsentDeductionCents(prisma, 3_000_000n, HOY, ACTOR)
    expect(await getAbsentDeductionCents(prisma)).toBe(3_000_000n)

    // Bug real de prod: cerrar el vigente "el día anterior" le dejaba
    // effectiveTo < effectiveFrom y la DB lo rechazaba con
    // payroll_config_effective_chk. Pasa siempre que se corrige un valor
    // recién cargado, que es el caso más común.
    await expect(setAbsentDeductionCents(prisma, 3_500_000n, HOY, ACTOR)).resolves.toBe(true)
    expect(await getAbsentDeductionCents(prisma)).toBe(3_500_000n)

    // Se pisó el vigente: una sola fila, sin rangos invertidos.
    expect(await prisma.payrollConfig.count({ where: { deletedAt: null } })).toBe(1)
    const row = await prisma.payrollConfig.findFirstOrThrow({ where: { effectiveTo: null, deletedAt: null } })
    expect(dateKey(row.effectiveFrom)).toBe('2026-09-10')
    expect(await prisma.auditLog.count({ where: { domain: 'PAYROLL', action: 'config-change' } })).toBe(2)
  })

  it('config: cambiarlo en un día POSTERIOR sí versiona (cierra el anterior el día previo)', async () => {
    await setAbsentDeductionCents(prisma, 3_000_000n, D('2026-09-01'), ACTOR)
    await setAbsentDeductionCents(prisma, 4_000_000n, D('2026-09-10'), ACTOR)

    expect(await getAbsentDeductionCents(prisma)).toBe(4_000_000n)
    expect(await prisma.payrollConfig.count({ where: { deletedAt: null } })).toBe(2)
    const cerrada = await prisma.payrollConfig.findFirstOrThrow({ where: { effectiveTo: { not: null }, deletedAt: null } })
    expect(dateKey(cerrada.effectiveFrom)).toBe('2026-09-01')
    expect(dateKey(cerrada.effectiveTo!)).toBe('2026-09-09') // el día previo al nuevo
  })

  it('config: una carga RETROACTIVA (antes del inicio del vigente) tampoco invierte el rango', async () => {
    await setAbsentDeductionCents(prisma, 3_000_000n, D('2026-09-10'), ACTOR)
    await expect(setAbsentDeductionCents(prisma, 2_000_000n, D('2026-09-01'), ACTOR)).resolves.toBe(true)

    expect(await getAbsentDeductionCents(prisma)).toBe(2_000_000n)
    expect(await prisma.payrollConfig.count({ where: { deletedAt: null } })).toBe(1)
    const row = await prisma.payrollConfig.findFirstOrThrow({ where: { effectiveTo: null, deletedAt: null } })
    expect(dateKey(row.effectiveFrom)).toBe('2026-09-01')
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
