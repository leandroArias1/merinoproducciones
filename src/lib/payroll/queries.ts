import type { PrismaClient } from '@/generated/prisma/client'
import { computePayrollItem } from '@/lib/domain/payroll'
import { buildPeriodRoster, type EmployeePayroll } from './build-input'

/**
 * Lecturas para la UI de liquidaciones. Los montos salen en BigInt (centavos);
 * el borde Server→Client los formatea con formatPesos y NUNCA pasa el BigInt.
 */

type Db = PrismaClient

export type PeriodStatus = 'OPEN' | 'CLOSED' | 'PAID'
export type ItemStatus = 'READY' | 'BLOCKED' | 'CLOSED' | 'PAID' | 'DRAFT'

export interface PeriodListRow {
  year: number
  month: number
  status: PeriodStatus
}

export async function listPeriods(db: Db): Promise<PeriodListRow[]> {
  const rows = await db.payrollPeriod.findMany({
    where: { deletedAt: null },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    select: { year: true, month: true, status: true },
  })
  return rows as PeriodListRow[]
}

export interface PeriodItemRow {
  employeeId: string
  employeeName: string
  baseCents: bigint
  deductionCents: bigint
  netCents: bigint
  absentDays: number
  status: ItemStatus
  itemId: string | null
  /** Día que lo bloquea ('YYYY-MM-DD'), para linkear al día y no a una lista vacía. */
  blockingDayKey: string | null
}

export interface PeriodDetail {
  year: number
  month: number
  status: PeriodStatus | 'NONE'
  rows: PeriodItemRow[]
  summary: { ready: number; blocked: number; closed: number; total: number }
}

/**
 * Detalle del período. Si está CLOSED/PAID muestra los ítems PERSISTIDOS; si está
 * OPEN (o no existe) calcula un PREVIEW en vivo (para el checklist de cierre),
 * respetando los ítems ya cerrados por baja.
 *
 * EXCEPCIÓN (bug real): en un período CLOSED, los ítems BLOCKED SÍ se vuelven a
 * evaluar en vivo. Un BLOCKED no tiene snapshot que preservar (base 0, neto 0,
 * sin líneas): es un "pendiente", no un recibo. Congelarlo hacía que un día ya
 * resuelto siguiera figurando como bloqueado para siempre, y —si alguien marcaba
 * el período como pagado— ese empleado no se liquidaba nunca, porque un PAID no
 * se reabre. Los ítems CLOSED/PAID de al lado NO se tocan: siguen saliendo del
 * snapshot congelado, byte por byte.
 *
 * En un período PAID no se re-evalúa: el mes ya está pagado y no hay acción
 * posible, así que mostrarlo como "listo" sería mentir. `payPeriod` ahora impide
 * llegar a ese estado con bloqueados.
 */
export async function getPeriodDetail(db: Db, year: number, month: number): Promise<PeriodDetail> {
  const period = await db.payrollPeriod.findFirst({ where: { year, month, deletedAt: null }, select: { id: true, status: true } })

  const existing = period
    ? await db.payrollItem.findMany({
        where: { periodId: period.id, deletedAt: null },
        select: {
          id: true,
          employeeId: true,
          status: true,
          baseCents: true,
          deductionCents: true,
          netCents: true,
          absentDays: true,
          employee: { select: { firstName: true, lastName: true } },
        },
      })
    : []
  const existingByEmp = new Map(existing.map((i) => [i.employeeId, i]))

  const rows: PeriodItemRow[] = []

  if (period && (period.status === 'CLOSED' || period.status === 'PAID')) {
    // Roster SOLO de los bloqueados: nada de lo cerrado se recalcula.
    const blockedIds = period.status === 'CLOSED' ? existing.filter((i) => i.status === 'BLOCKED').map((i) => i.employeeId) : []
    const rosterById = new Map<string, EmployeePayroll>()
    if (blockedIds.length > 0) {
      for (const emp of await buildPeriodRoster(db, year, month, { employeeIds: blockedIds })) rosterById.set(emp.employeeId, emp)
    }

    for (const i of existing) {
      const employeeName = `${i.employee.lastName}, ${i.employee.firstName}`
      const emp = rosterById.get(i.employeeId)
      if (emp) {
        const r = computePayrollItem(emp.input)
        rows.push(
          r.status === 'BLOCKED'
            ? { employeeId: i.employeeId, employeeName, baseCents: 0n, deductionCents: 0n, netCents: 0n, absentDays: emp.input.absentDays, status: 'BLOCKED', itemId: i.id, blockingDayKey: emp.blockingDayKey }
            : { employeeId: i.employeeId, employeeName, baseCents: r.baseCents, deductionCents: r.deductionCents, netCents: r.netCents, absentDays: r.absentDays, status: 'READY', itemId: i.id, blockingDayKey: null },
        )
        continue
      }
      rows.push({
        employeeId: i.employeeId,
        employeeName,
        baseCents: i.baseCents,
        deductionCents: i.deductionCents,
        netCents: i.netCents,
        absentDays: i.absentDays,
        status: i.status as ItemStatus,
        itemId: i.id,
        blockingDayKey: null,
      })
    }
  } else {
    const roster = await buildPeriodRoster(db, year, month)
    for (const emp of roster) {
      const ex = existingByEmp.get(emp.employeeId)
      if (ex && (ex.status === 'CLOSED' || ex.status === 'PAID')) {
        rows.push({
          employeeId: emp.employeeId,
          employeeName: emp.employeeName,
          baseCents: ex.baseCents,
          deductionCents: ex.deductionCents,
          netCents: ex.netCents,
          absentDays: ex.absentDays,
          status: ex.status as ItemStatus,
          itemId: ex.id,
          blockingDayKey: null,
        })
        continue
      }
      const r = computePayrollItem(emp.input)
      if (r.status === 'BLOCKED') {
        rows.push({ employeeId: emp.employeeId, employeeName: emp.employeeName, baseCents: 0n, deductionCents: 0n, netCents: 0n, absentDays: emp.input.absentDays, status: 'BLOCKED', itemId: ex?.id ?? null, blockingDayKey: emp.blockingDayKey })
      } else {
        rows.push({ employeeId: emp.employeeId, employeeName: emp.employeeName, baseCents: r.baseCents, deductionCents: r.deductionCents, netCents: r.netCents, absentDays: r.absentDays, status: 'READY', itemId: ex?.id ?? null, blockingDayKey: null })
      }
    }
  }

  rows.sort((a, b) => a.employeeName.localeCompare(b.employeeName))
  const summary = {
    ready: rows.filter((r) => r.status === 'READY').length,
    blocked: rows.filter((r) => r.status === 'BLOCKED').length,
    closed: rows.filter((r) => r.status === 'CLOSED' || r.status === 'PAID').length,
    total: rows.length,
  }
  return { year, month, status: (period?.status as PeriodStatus) ?? 'NONE', rows, summary }
}

export interface ReceiptLine {
  kind: 'BASE' | 'DEDUCTION' | 'ADJUSTMENT'
  concept: string
  amountCents: bigint
}
export interface Receipt {
  itemId: string
  employeeName: string
  documentId: string
  year: number
  month: number
  status: ItemStatus
  baseCents: bigint
  deductionCents: bigint
  netCents: bigint
  absentDays: number
  lines: ReceiptLine[]
}

export async function getReceipt(db: Db, itemId: string): Promise<Receipt | null> {
  const item = await db.payrollItem.findFirst({
    where: { id: itemId, deletedAt: null },
    select: {
      id: true,
      status: true,
      baseCents: true,
      deductionCents: true,
      netCents: true,
      absentDays: true,
      employee: { select: { firstName: true, lastName: true, documentId: true } },
      period: { select: { year: true, month: true } },
      lines: { orderBy: { sortOrder: 'asc' }, select: { kind: true, concept: true, amountCents: true } },
    },
  })
  if (!item) return null
  return {
    itemId: item.id,
    employeeName: `${item.employee.lastName}, ${item.employee.firstName}`,
    documentId: item.employee.documentId,
    year: item.period.year,
    month: item.period.month,
    status: item.status as ItemStatus,
    baseCents: item.baseCents,
    deductionCents: item.deductionCents,
    netCents: item.netCents,
    absentDays: item.absentDays,
    lines: item.lines as ReceiptLine[],
  }
}

export interface RaiseEmployee {
  id: string
  name: string
  categoryName: string
  vigenteCents: bigint | null
}

export async function listEmployeesForRaise(db: Db): Promise<RaiseEmployee[]> {
  const emps = await db.employee.findMany({
    where: { deletedAt: null, active: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      category: { select: { name: true } },
      salaryHistory: { where: { effectiveTo: null, deletedAt: null }, select: { monthlyCents: true }, take: 1 },
    },
  })
  return emps.map((e) => ({
    id: e.id,
    name: `${e.lastName}, ${e.firstName}`,
    categoryName: e.category?.name ?? '—',
    vigenteCents: e.salaryHistory[0]?.monthlyCents ?? null,
  }))
}
