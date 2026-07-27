import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { prisma } from '@/lib/db'
import { workDateFromKey } from '@/lib/attendance/timezone'
import { buildPeriodRoster } from '@/lib/payroll/build-input'
import { closeBlockedItem, closePeriod, generateBajaItem, reopenPeriod, payPeriod } from '@/lib/payroll/close'
import { getPeriodDetail } from '@/lib/payroll/queries'
import { bulkSetSalary } from '@/lib/payroll/salary'

const ACTOR = 'admin-user-id'
const LV = 75_000_000n // 750.000
const LM = 50_000_000n // 500.000
const DED = 3_000_000n // 30.000

async function clean() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE payroll_line, payroll_item, payroll_period, payroll_config, salary_history, "user", account, session, employee_category, category_day, employee, work_schedule, attendance, audit_log, event_assignment, time_entry, leave_request, event, holiday RESTART IDENTITY CASCADE',
  )
}

let dni = 0
async function mkEmployee(opts: { hireDate?: string; deletedAt?: Date; categoryId?: string } = {}) {
  dni++
  return prisma.employee.create({
    data: {
      firstName: 'E',
      lastName: `Emp${dni}`,
      documentId: `4000000${dni}`,
      hireDate: workDateFromKey(opts.hireDate ?? '2026-01-01'),
      deletedAt: opts.deletedAt ?? null,
      active: !opts.deletedAt,
      categoryId: opts.categoryId ?? null,
    },
    select: { id: true },
  })
}
async function mkSalary(employeeId: string, cents: bigint, fromKey = '2026-01-01', toKey: string | null = null) {
  await prisma.salaryHistory.create({
    data: { employeeId, monthlyCents: cents, effectiveFrom: workDateFromKey(fromKey), effectiveTo: toKey ? workDateFromKey(toKey) : null },
  })
}
async function mkConfig(cents: bigint) {
  await prisma.payrollConfig.create({ data: { absentDeductionCents: cents, effectiveFrom: workDateFromKey('2026-01-01') } })
}
async function mkAtt(employeeId: string, key: string, status: string) {
  await prisma.attendance.create({ data: { employeeId, workDate: workDateFromKey(key), status: status as never, workedMinutes: 0 } })
}

beforeEach(async () => {
  dni = 0
  await clean()
  await prisma.user.create({ data: { id: ACTOR, email: 'a@t.com', name: 'A', role: 'ADMIN' } })
  await mkConfig(DED)
})
afterAll(async () => {
  await prisma.$disconnect()
})

// Septiembre 2026: 30 días.
const Y = 2026
const M = 9

describe('liquidaciones — orquestación', () => {
  it('roster del período incluye al dado de baja a mitad de mes, excluye al de un mes anterior', async () => {
    const activo = await mkEmployee({})
    const baja15 = await mkEmployee({ deletedAt: new Date('2026-09-15T12:00:00-03:00') })
    await mkEmployee({ deletedAt: new Date('2026-08-20T12:00:00-03:00') }) // baja en agosto → fuera
    await mkSalary(activo.id, LV)
    await mkSalary(baja15.id, LV)

    const roster = await buildPeriodRoster(prisma, Y, M)
    const ids = roster.map((r) => r.employeeId)
    expect(ids).toContain(activo.id)
    expect(ids).toContain(baja15.id)
    expect(roster).toHaveLength(2) // el de agosto NO está
  })

  it('un empleado con día UNVERIFIED queda BLOCKED y no se cierra; los demás sí', async () => {
    const ok = await mkEmployee({})
    const blocked = await mkEmployee({})
    await mkSalary(ok.id, LV)
    await mkSalary(blocked.id, LV)
    await mkAtt(blocked.id, '2026-09-10', 'UNVERIFIED') // día sin resolver

    const s = await closePeriod(prisma, Y, M, ACTOR)
    expect(s.closed).toBe(1)
    expect(s.blocked).toBe(1)

    const okItem = await prisma.payrollItem.findFirstOrThrow({ where: { employeeId: ok.id } })
    expect(okItem.status).toBe('CLOSED')
    expect(okItem.netCents).toBe(LV)

    const blockedItem = await prisma.payrollItem.findFirstOrThrow({ where: { employeeId: blocked.id } })
    expect(blockedItem.status).toBe('BLOCKED')

    // El período cierra igual (los bloqueados se difieren).
    const period = await prisma.payrollPeriod.findFirstOrThrow({ where: { year: Y, month: M } })
    expect(period.status).toBe('CLOSED')
  })

  it('baja a mitad de mes genera el ítem cerrado con el proporcional correcto', async () => {
    const emp = await mkEmployee({ deletedAt: new Date('2026-09-15T12:00:00-03:00') })
    await mkSalary(emp.id, LV)

    const r = await generateBajaItem(prisma, emp.id, workDateFromKey('2026-09-15'), ACTOR)
    expect(r).toBe('closed')

    const item = await prisma.payrollItem.findFirstOrThrow({ where: { employeeId: emp.id } })
    expect(item.status).toBe('CLOSED')
    expect(item.netCents).toBe(37_500_000n) // 75.000.000 × 15/30
    expect(item.absentDays).toBe(0)

    // Y el cierre de fin de mes NO lo recalcula (ya está cerrado).
    const s = await closePeriod(prisma, Y, M, ACTOR)
    expect(s.skipped).toBe(1)
  })

  it('fallback: si la baja NO generó el ítem, el cierre de fin de mes lo levanta PROPORCIONAL (no mes entero)', async () => {
    // Simula "generateBajaItem falló": deletedAt 15/09 pero SIN ítem previo.
    const emp = await mkEmployee({ deletedAt: new Date('2026-09-15T12:00:00-03:00') })
    await mkSalary(emp.id, LV)
    // NO llamo generateBajaItem → no hay ítem.

    await closePeriod(prisma, Y, M, ACTOR)

    const item = await prisma.payrollItem.findFirstOrThrow({ where: { employeeId: emp.id } })
    expect(item.status).toBe('CLOSED')
    expect(item.netCents).toBe(37_500_000n) // proporcional 15/30, NO 75.000.000
  })

  it('cambio de sueldo a mitad de mes → dos segments, cada uno con su vigencia', async () => {
    const emp = await mkEmployee({})
    await mkSalary(emp.id, LM, '2026-01-01', '2026-09-14') // v1 hasta el 14
    await mkSalary(emp.id, LV, '2026-09-15', null) // v2 desde el 15

    const roster = await buildPeriodRoster(prisma, Y, M)
    const seg = roster[0].input.segments
    expect(seg).toHaveLength(2)
    expect(seg[0]).toMatchObject({ monthlyCents: LM, activeDays: 14 })
    expect(seg[1]).toMatchObject({ monthlyCents: LV, activeDays: 16 })
  })

  it('aumento bulk a 3 empleados → 3 SalaryHistory versionados + 3 AuditLog', async () => {
    const a = await mkEmployee({})
    const b = await mkEmployee({})
    const c = await mkEmployee({})
    for (const e of [a, b, c]) await mkSalary(e.id, LM) // vigente = 500k

    const changed = await bulkSetSalary(prisma, [a.id, b.id, c.id], LV, workDateFromKey('2026-09-01'), ACTOR)
    expect(changed).toBe(3)

    // Cada uno con su nuevo vigente 750k y el viejo cerrado.
    const vigentes = await prisma.salaryHistory.count({ where: { monthlyCents: LV, effectiveTo: null } })
    expect(vigentes).toBe(3)
    const cerrados = await prisma.salaryHistory.count({ where: { monthlyCents: LM, effectiveTo: { not: null } } })
    expect(cerrados).toBe(3)

    const audits = await prisma.auditLog.count({ where: { domain: 'PAYROLL', action: 'salary-change' } })
    expect(audits).toBe(3)
  })

  it('reapertura de un período CLOSED (no PAID) recalcula; PAID no se reabre', async () => {
    const emp = await mkEmployee({})
    await mkSalary(emp.id, LV)

    await closePeriod(prisma, Y, M, ACTOR)
    let item = await prisma.payrollItem.findFirstOrThrow({ where: { employeeId: emp.id } })
    expect(item.netCents).toBe(LV) // sin faltas

    // Reabrir, aparece una falta, re-cerrar → recalcula con el descuento.
    await reopenPeriod(prisma, Y, M, ACTOR)
    const reopened = await prisma.payrollPeriod.findFirstOrThrow({ where: { year: Y, month: M } })
    expect(reopened.status).toBe('OPEN')

    await mkAtt(emp.id, '2026-09-10', 'ABSENT')
    await closePeriod(prisma, Y, M, ACTOR)
    item = await prisma.payrollItem.findFirstOrThrow({ where: { employeeId: emp.id } })
    expect(item.netCents).toBe(LV - DED) // 750.000 − 30.000

    // Pagar y confirmar que PAID no se reabre.
    await payPeriod(prisma, Y, M, ACTOR)
    await expect(reopenPeriod(prisma, Y, M, ACTOR)).rejects.toThrow(/PAGADO no se reabre/)
  })
})

/**
 * Bug real de prod: un día UNVERIFIED se resolvía DESPUÉS de cerrar el mes y el
 * ítem seguía BLOCKED para siempre, porque la pantalla de un período cerrado
 * mostraba el snapshot congelado y nadie lo volvía a evaluar. Peor: se podía
 * marcar el mes como pagado, y un PAID no se reabre → ese empleado no cobraba
 * ese mes nunca. El diálogo de cierre prometía justo lo contrario ("podés
 * cerrarlos después").
 */
describe('bloqueado resuelto después del cierre', () => {
  it('deja de bloquear, se cierra INDIVIDUALMENTE y los otros recibos quedan intactos', async () => {
    const otros = []
    for (let i = 0; i < 7; i++) {
      const e = await mkEmployee({})
      await mkSalary(e.id, LV)
      otros.push(e.id)
    }
    const trabado = await mkEmployee({})
    await mkSalary(trabado.id, LV)
    await mkAtt(trabado.id, '2026-09-10', 'UNVERIFIED')

    const s = await closePeriod(prisma, Y, M, ACTOR)
    expect(s.closed).toBe(7)
    expect(s.blocked).toBe(1)

    // Foto EXACTA de los 7 recibos ya emitidos (incluye updatedAt: si alguno se
    // reescribiera, aunque diera el mismo número, esto lo delata).
    const antes = await prisma.payrollItem.findMany({ where: { employeeId: { in: otros } }, orderBy: { employeeId: 'asc' } })
    expect(antes).toHaveLength(7)

    // Antes de resolver: sigue bloqueado, y la fila sabe QUÉ día lo traba.
    const bloqueado = (await getPeriodDetail(prisma, Y, M)).rows.find((r) => r.employeeId === trabado.id)!
    expect(bloqueado.status).toBe('BLOCKED')
    expect(bloqueado.blockingDayKey).toBe('2026-09-10')

    // Cerrarlo así todavía tiene que fallar.
    await expect(closeBlockedItem(prisma, Y, M, trabado.id, ACTOR)).rejects.toThrow(/sin verificar/)

    // Se resuelve el día (como en prod: la asignación se cancela → ABSENT).
    await prisma.attendance.updateMany({
      where: { employeeId: trabado.id, workDate: workDateFromKey('2026-09-10') },
      data: { status: 'ABSENT' },
    })

    // La pantalla del mes CERRADO ya lo muestra listo, sin reabrir nada.
    const detail = await getPeriodDetail(prisma, Y, M)
    expect(detail.status).toBe('CLOSED')
    const fila = detail.rows.find((r) => r.employeeId === trabado.id)!
    expect(fila.status).toBe('READY')
    expect(fila.netCents).toBe(LV - DED)
    expect(fila.blockingDayKey).toBeNull()

    // Cierre individual: mismo cálculo que el cierre de fin de mes.
    await closeBlockedItem(prisma, Y, M, trabado.id, ACTOR)
    const item = await prisma.payrollItem.findFirstOrThrow({ where: { employeeId: trabado.id } })
    expect(item.status).toBe('CLOSED')
    expect(item.netCents).toBe(LV - DED) // 750.000 − 30.000, con su falta
    expect(item.absentDays).toBe(1)
    expect(await prisma.payrollLine.count({ where: { itemId: item.id } })).toBeGreaterThan(0) // tiene recibo

    // Y el período NO se reabrió.
    const period = await prisma.payrollPeriod.findFirstOrThrow({ where: { year: Y, month: M } })
    expect(period.status).toBe('CLOSED')

    // LO CRÍTICO: los otros 7 recibos, byte por byte, sin recalcular.
    const despues = await prisma.payrollItem.findMany({ where: { employeeId: { in: otros } }, orderBy: { employeeId: 'asc' } })
    expect(despues).toEqual(antes)
  })

  it('pagar un período con bloqueados es RECHAZADO, y nombra a quién falta', async () => {
    const ok = await mkEmployee({})
    const trabado = await mkEmployee({})
    await mkSalary(ok.id, LV)
    await mkSalary(trabado.id, LV)
    await mkAtt(trabado.id, '2026-09-10', 'UNVERIFIED')
    await closePeriod(prisma, Y, M, ACTOR)

    await expect(payPeriod(prisma, Y, M, ACTOR)).rejects.toThrow(/sin liquidar/)
    // Nombra al que falta, para no dejar al usuario buscándolo.
    await expect(payPeriod(prisma, Y, M, ACTOR)).rejects.toThrow(/Emp2/)

    // Sigue CERRADO (no quedó a medio pagar).
    const period = await prisma.payrollPeriod.findFirstOrThrow({ where: { year: Y, month: M } })
    expect(period.status).toBe('CLOSED')

    // Resuelto y cerrado su recibo, ahora sí se paga.
    await prisma.attendance.updateMany({
      where: { employeeId: trabado.id, workDate: workDateFromKey('2026-09-10') },
      data: { status: 'ABSENT' },
    })
    await closeBlockedItem(prisma, Y, M, trabado.id, ACTOR)
    await payPeriod(prisma, Y, M, ACTOR)
    expect((await prisma.payrollItem.findMany({ where: { periodId: period.id } })).every((i) => i.status === 'PAID')).toBe(true)
  })
})
