import type { PrismaClient } from '@/generated/prisma/client'
import { computePayrollItem } from '@/lib/domain/payroll'
import { buildPeriodRoster } from './build-input'

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
    for (const i of existing) {
      rows.push({
        employeeId: i.employeeId,
        employeeName: `${i.employee.lastName}, ${i.employee.firstName}`,
        baseCents: i.baseCents,
        deductionCents: i.deductionCents,
        netCents: i.netCents,
        absentDays: i.absentDays,
        status: i.status as ItemStatus,
        itemId: i.id,
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
        })
        continue
      }
      const r = computePayrollItem(emp.input)
      if (r.status === 'BLOCKED') {
        rows.push({ employeeId: emp.employeeId, employeeName: emp.employeeName, baseCents: 0n, deductionCents: 0n, netCents: 0n, absentDays: emp.input.absentDays, status: 'BLOCKED', itemId: ex?.id ?? null })
      } else {
        rows.push({ employeeId: emp.employeeId, employeeName: emp.employeeName, baseCents: r.baseCents, deductionCents: r.deductionCents, netCents: r.netCents, absentDays: r.absentDays, status: 'READY', itemId: ex?.id ?? null })
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
