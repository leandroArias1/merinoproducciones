import { DateTime } from 'luxon'
import type { PrismaClient } from '@/generated/prisma/client'
import { BA_ZONE, dateKey } from '@/lib/attendance/timezone'
import type { PayrollInput, SalarySegment } from '@/lib/domain/payroll'

/**
 * Caller del motor de liquidación: trae datos de la DB y arma el `PayrollInput`
 * plano para `computePayrollItem`. Mismo patrón que `buildInput` del sweep:
 * queries en BULK, agrupación en memoria, sin N+1. La función pura no toca la
 * DB ni cuenta faltas — eso pasa acá.
 */

type Db = PrismaClient

// ── Fechas del período (calendario Buenos Aires) ──

export interface MonthBounds {
  startKey: string // 'YYYY-MM-01'
  endKey: string // último día
  daysInMonth: number
}

export function monthBounds(year: number, month: number): MonthBounds {
  const start = DateTime.fromObject({ year, month, day: 1 }, { zone: BA_ZONE })
  return { startKey: start.toISODate() as string, endKey: start.endOf('month').toISODate() as string, daysInMonth: start.daysInMonth as number }
}

const maxKey = (a: string, b: string) => (a >= b ? a : b)
const minKey = (a: string, b: string) => (a <= b ? a : b)
const dayNum = (key: string) => Number(key.slice(8, 10))
/** Días calendario inclusive entre dos claves 'YYYY-MM-DD'. */
function daysInclusive(fromKey: string, toKey: string): number {
  return Math.round(DateTime.fromISO(toKey).diff(DateTime.fromISO(fromKey), 'days').days) + 1
}

// ── Ventana activa del empleado dentro del mes ──

export interface EmployeeWindowRow {
  hireDate: Date | null
  deletedAt: Date | null // baja (Timestamptz) → se resuelve al día BA
}

/**
 * Intersección de [empleo] con [mes]. `asOfEndKey` fuerza el fin (caso baja:
 * la fecha de baja). Devuelve null si el empleado no estuvo activo en el mes.
 */
export function activeWindow(row: EmployeeWindowRow, m: MonthBounds, asOfEndKey?: string): { startKey: string; endKey: string } | null {
  const hireKey = row.hireDate ? dateKey(row.hireDate) : m.startKey
  const bajaKey = row.deletedAt ? (DateTime.fromJSDate(row.deletedAt).setZone(BA_ZONE).toISODate() as string) : null
  const startKey = maxKey(hireKey, m.startKey)
  let endKey = asOfEndKey ?? m.endKey
  if (bajaKey) endKey = minKey(endKey, bajaKey)
  endKey = minKey(endKey, m.endKey)
  if (startKey > endKey) return null
  return { startKey, endKey }
}

// ── Segmentación por versión de sueldo ──

export interface SalaryVersion {
  monthlyCents: bigint
  fromKey: string
  toKey: string | null // null = vigente
}

/**
 * Un `SalarySegment` por versión de sueldo que solapa la ventana activa, con sus
 * días activos. Si hubo cambio de sueldo/categoría a mitad de mes hay 2+ tramos.
 * El label lleva el rango de días cuando hay más de un tramo (para distinguirlos
 * en el recibo).
 */
export function buildSegments(versions: SalaryVersion[], win: { startKey: string; endKey: string }, m: MonthBounds, categoryLabel: string): SalarySegment[] {
  const sorted = [...versions].sort((a, b) => a.fromKey.localeCompare(b.fromKey))
  const segs: { monthlyCents: bigint; activeDays: number; startKey: string; endKey: string }[] = []
  for (const v of sorted) {
    const segStart = maxKey(v.fromKey, win.startKey)
    const segEnd = v.toKey ? minKey(v.toKey, win.endKey) : win.endKey
    if (segStart > segEnd) continue
    segs.push({ monthlyCents: v.monthlyCents, activeDays: daysInclusive(segStart, segEnd), startKey: segStart, endKey: segEnd })
  }
  return segs.map((s) => ({
    label: segs.length > 1 ? `${categoryLabel} (${dayNum(s.startKey)}–${dayNum(s.endKey)})` : categoryLabel,
    monthlyCents: s.monthlyCents,
    activeDays: s.activeDays,
  }))
}

// ── Roster del período (bulk, sin N+1) ──

export interface EmployeePayroll {
  employeeId: string
  employeeName: string
  /** Alias bancario/CBU. Solo se transporta para mostrarlo al pagar: NO entra
   *  en ningún cálculo — `computePayrollItem` ni lo ve. */
  alias: string | null
  input: PayrollInput
  /**
   * PRIMER día sin resolver que lo bloquea ('YYYY-MM-DD'), o null si no hay.
   * Existe para que la UI mande al usuario AL DÍA concreto: el link "Resolver"
   * apuntaba a la lista genérica de días a revisar, que puede estar vacía —y
   * entonces era un callejón sin salida.
   */
  blockingDayKey: string | null
}

/** Estados de asistencia que cuentan/bloquean. */
const ABSENT = 'ABSENT'
const BLOCKING = new Set(['UNVERIFIED', 'INCOMPLETE'])

/**
 * Arma el `PayrollInput` de TODO el roster del período. Roster = empleados
 * activos en ALGÚN momento del mes (incluye al dado de baja a mitad de mes).
 * `asOfEndKey` fuerza el fin de ventana (caso baja de un solo empleado).
 */
export async function buildPeriodRoster(db: Db, year: number, month: number, opts?: { employeeIds?: string[]; asOfEndKey?: string }): Promise<EmployeePayroll[]> {
  const m = monthBounds(year, month)
  const from = new Date(`${m.startKey}T00:00:00.000Z`)
  const to = new Date(`${m.endKey}T00:00:00.000Z`)

  // 1) Roster: intersección empleo ∩ mes.
  const employees = await db.employee.findMany({
    where: {
      ...(opts?.employeeIds ? { id: { in: opts.employeeIds } } : {}),
      AND: [
        { OR: [{ hireDate: null }, { hireDate: { lte: to } }] },
        { OR: [{ deletedAt: null }, { deletedAt: { gte: from } }] },
      ],
    },
    select: { id: true, firstName: true, lastName: true, alias: true, hireDate: true, deletedAt: true, category: { select: { name: true } } },
  })
  if (employees.length === 0) return []
  const empIds = employees.map((e) => e.id)

  // 2-4) Bulk: sueldos, config vigente, asistencia del mes.
  const [salaries, config, attendance] = await Promise.all([
    db.salaryHistory.findMany({
      where: { employeeId: { in: empIds }, deletedAt: null, effectiveFrom: { lte: to }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }] },
      select: { employeeId: true, monthlyCents: true, effectiveFrom: true, effectiveTo: true },
    }),
    // Config vigente el último día del período.
    db.payrollConfig.findFirst({
      where: { deletedAt: null, effectiveFrom: { lte: to } },
      orderBy: { effectiveFrom: 'desc' },
      select: { absentDeductionCents: true },
    }),
    db.attendance.findMany({
      where: { employeeId: { in: empIds }, workDate: { gte: from, lte: to }, status: { in: [ABSENT, 'UNVERIFIED', 'INCOMPLETE'] } },
      select: { employeeId: true, workDate: true, status: true },
    }),
  ])
  const deduction = config?.absentDeductionCents ?? 0n

  const salaryByEmp = new Map<string, SalaryVersion[]>()
  for (const s of salaries) push(salaryByEmp, s.employeeId, { monthlyCents: s.monthlyCents, fromKey: dateKey(s.effectiveFrom), toKey: s.effectiveTo ? dateKey(s.effectiveTo) : null })

  const attByEmp = new Map<string, { key: string; status: string }[]>()
  for (const a of attendance) push(attByEmp, a.employeeId, { key: dateKey(a.workDate), status: a.status })

  const result: EmployeePayroll[] = []
  for (const e of employees) {
    const win = activeWindow(e, m, opts?.asOfEndKey)
    if (!win) continue // no estuvo activo en el mes

    const versions = salaryByEmp.get(e.id) ?? []
    const segments = buildSegments(versions, win, m, e.category?.name ?? 'Mensual')

    const att = (attByEmp.get(e.id) ?? []).filter((a) => a.key >= win.startKey && a.key <= win.endKey)
    const absentDays = att.filter((a) => a.status === ABSENT).length
    const blockingDays = att.filter((a) => BLOCKING.has(a.status)).map((a) => a.key).sort()

    result.push({
      employeeId: e.id,
      employeeName: `${e.lastName}, ${e.firstName}`,
      alias: e.alias,
      input: { daysInMonth: m.daysInMonth, segments, absentDays, deductionPerAbsentCents: deduction, blocked: blockingDays.length > 0 },
      blockingDayKey: blockingDays[0] ?? null,
    })
  }
  return result
}

function push<T>(map: Map<string, T[]>, k: string, v: T): void {
  const arr = map.get(k)
  if (arr) arr.push(v)
  else map.set(k, [v])
}
