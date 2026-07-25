import type { PrismaClient } from '@/generated/prisma/client'
import {
  resolveAttendance,
  type AttendanceInput,
  type AssignmentInput,
  type AssignmentStatus,
  type LeaveType,
} from '@/lib/domain/attendance'
import { DEFAULT_ATTENDANCE_CONFIG } from '@/lib/domain/attendance-config'
import { SWEEP_DEFAULTS } from './config'
import { planAttendance, executePlan, executePlanBatch, type ExistingRow, type Plan } from './persist'
import { dateKey, dowBA, listDateKeys, resolveScheduleInterval } from './timezone'

export type Db = PrismaClient

// ── Tipos crudos (subset que consultamos de cada tabla) ──
interface ScheduleRow {
  dayOfWeek: number
  startMinute: number
  endMinute: number
  effectiveFrom: Date
  effectiveTo: Date | null
}
interface AssignmentRow {
  startAt: Date
  endAt: Date
  status: string
  workDate: Date
}
interface EntryRow {
  checkIn: Date
  checkOut: Date | null
  workDate: Date
}
interface LeaveRow {
  type: string
  dateFrom: Date
  dateTo: Date
}

// ── Construcción del input del motor para un (empleado, día) ──
// PURA respecto de la DB: recibe los datos ya traídos y agrupados.
export function buildInput(args: {
  key: string
  employeeId?: string
  schedules: ScheduleRow[] // TODOS los del empleado (se filtran acá)
  assignments: AssignmentRow[] // ya del emp+día
  entries: EntryRow[] // ya del emp+día
  leaves: LeaveRow[] // TODAS las aprobadas del empleado
  isHoliday: boolean
}): AttendanceInput {
  const { key, employeeId, schedules, assignments, entries, leaves, isHoliday } = args
  const dow = dowBA(key)

  const vigentes = schedules
    .filter(
      (s) =>
        s.dayOfWeek === dow &&
        dateKey(s.effectiveFrom) <= key &&
        (s.effectiveTo === null || dateKey(s.effectiveTo) >= key),
    )
    .sort((a, b) => a.startMinute - b.startMinute)

  // TURNO PARTIDO: el motor modela UN solo intervalo habitual por día, pero
  // el schema (CategoryDay/WorkSchedule) permite varios tramos. Antes que
  // devolver un expectedMinutes silenciosamente corto en un sistema de
  // sueldos, se rompe ruidosamente para que se note y se resuelva.
  if (vigentes.length > 1) {
    throw new Error(
      `Turno partido no soportado: ${vigentes.length} tramos de WorkSchedule ` +
        `para ${employeeId ? `empleado ${employeeId} ` : ''}el ${key}. El motor ` +
        'de asistencia modela un solo intervalo habitual por día.',
    )
  }

  const habitualInterval =
    vigentes.length === 1
      ? resolveScheduleInterval(key, vigentes[0].startMinute, vigentes[0].endMinute)
      : null

  const assignmentsInput: AssignmentInput[] = assignments.map((a) => ({
    start: a.startAt,
    end: a.endAt,
    status: a.status as AssignmentStatus,
  }))

  const leave = leaves.find((l) => dateKey(l.dateFrom) <= key && dateKey(l.dateTo) >= key)

  return {
    habitualInterval,
    assignments: assignmentsInput,
    approvedLeave: leave ? { type: leave.type as LeaveType } : null,
    isHoliday,
    timeEntries: entries.map((e) => ({ checkIn: e.checkIn, checkOut: e.checkOut })),
    config: DEFAULT_ATTENDANCE_CONFIG,
  }
}

export interface SweepParams {
  from: Date // workDate (medianoche UTC) inicio de ventana, inclusive
  to: Date // fin de ventana, inclusive
  chunkSize?: number
  actorId?: string | null
}

export interface SweepSummary {
  windowFrom: string
  windowTo: string
  employees: number
  days: number
  records: number // filas de asistencia presentes tras el barrido
  byStatus: Record<string, number>
  unverifiedRemaining: number
  writes: { created: number; updated: number; deleted: number; noop: number }
}

const key = (empId: string, k: string) => `${empId}|${k}`

/**
 * BARRIDO con ventana móvil. Recalcula TODA la ventana [from, to], no sólo
 * ayer, para que un día que se resuelve tarde (UNVERIFIED -> COMPLETED) se
 * corrija. Trae toda la ventana en ~7 queries (sin N+1) y recién ahí itera
 * llamando a la función pura por (empleado, día).
 */
export async function sweepAttendance(db: Db, params: SweepParams): Promise<SweepSummary> {
  const chunkSize = params.chunkSize ?? SWEEP_DEFAULTS.chunkSize
  const actorId = params.actorId ?? null
  const fromKey = dateKey(params.from)
  const toKey = dateKey(params.to)
  const keys = listDateKeys(fromKey, toKey)

  // 1) empleados activos
  const employees = await db.employee.findMany({
    where: { deletedAt: null, active: true },
    select: { id: true },
  })
  const empIds = employees.map((e) => e.id)

  const summary: SweepSummary = {
    windowFrom: fromKey,
    windowTo: toKey,
    employees: empIds.length,
    days: keys.length,
    records: 0,
    byStatus: {},
    unverifiedRemaining: 0,
    writes: { created: 0, updated: 0, deleted: 0, noop: 0 },
  }
  if (empIds.length === 0) return summary

  // 2-7) TODO en bulk (constante en cantidad de queries, no escala por empleado)
  const [schedules, assignments, entries, leaves, holidays, existing] = await Promise.all([
    db.workSchedule.findMany({
      where: {
        employeeId: { in: empIds },
        deletedAt: null,
        effectiveFrom: { lte: params.to },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: params.from } }],
      },
      select: { employeeId: true, dayOfWeek: true, startMinute: true, endMinute: true, effectiveFrom: true, effectiveTo: true },
    }),
    db.eventAssignment.findMany({
      where: { employeeId: { in: empIds }, deletedAt: null, workDate: { gte: params.from, lte: params.to } },
      select: { employeeId: true, startAt: true, endAt: true, status: true, workDate: true },
    }),
    db.timeEntry.findMany({
      where: { employeeId: { in: empIds }, deletedAt: null, workDate: { gte: params.from, lte: params.to } },
      select: { employeeId: true, checkIn: true, checkOut: true, workDate: true },
    }),
    db.leaveRequest.findMany({
      where: {
        employeeId: { in: empIds },
        deletedAt: null,
        status: 'APPROVED',
        dateFrom: { lte: params.to },
        dateTo: { gte: params.from },
      },
      select: { employeeId: true, type: true, dateFrom: true, dateTo: true },
    }),
    db.holiday.findMany({
      where: { date: { gte: params.from, lte: params.to } },
      select: { date: true },
    }),
    db.attendance.findMany({
      where: { employeeId: { in: empIds }, workDate: { gte: params.from, lte: params.to } },
      select: { id: true, employeeId: true, workDate: true, status: true, source: true, workedMinutes: true, expectedMinutes: true, warnings: true },
    }),
  ])

  // Agrupación en memoria
  const schedByEmp = new Map<string, ScheduleRow[]>()
  for (const s of schedules) push(schedByEmp, s.employeeId, s)

  const asgByEmpDay = new Map<string, AssignmentRow[]>()
  for (const a of assignments) push(asgByEmpDay, key(a.employeeId, dateKey(a.workDate)), a)

  const entryByEmpDay = new Map<string, EntryRow[]>()
  for (const e of entries) push(entryByEmpDay, key(e.employeeId, dateKey(e.workDate)), e)

  const leaveByEmp = new Map<string, LeaveRow[]>()
  for (const l of leaves) push(leaveByEmp, l.employeeId, l)

  const holidaySet = new Set(holidays.map((h) => dateKey(h.date)))

  const existingByEmpDay = new Map<string, ExistingRow>()
  for (const r of existing) {
    existingByEmpDay.set(key(r.employeeId, dateKey(r.workDate)), {
      id: r.id,
      status: r.status,
      source: r.source as ExistingRow['source'],
      workedMinutes: r.workedMinutes,
      expectedMinutes: r.expectedMinutes,
      warnings: r.warnings,
    })
  }

  // Fase de decisión (pura): plan por (empleado, día). Los noops se descartan
  // antes de abrir cualquier transacción.
  const actionable: Array<{ employeeId: string; workDate: Date; plan: Plan }> = []
  for (const empId of empIds) {
    const schedules = schedByEmp.get(empId) ?? []
    const leaves = leaveByEmp.get(empId) ?? []
    for (const k of keys) {
      const input = buildInput({
        key: k,
        employeeId: empId,
        schedules,
        assignments: asgByEmpDay.get(key(empId, k)) ?? [],
        entries: entryByEmpDay.get(key(empId, k)) ?? [],
        leaves,
        isHoliday: holidaySet.has(k),
      })
      const result = resolveAttendance(input)
      const plan = planAttendance(result, existingByEmpDay.get(key(empId, k)) ?? null)

      // Resumen sobre el estado FINAL (incluye noops que dejan fila existente).
      if (plan.finalStatus !== null) {
        summary.records++
        summary.byStatus[plan.finalStatus] = (summary.byStatus[plan.finalStatus] ?? 0) + 1
        if (plan.finalStatus === 'UNVERIFIED') summary.unverifiedRemaining++
      }

      if (plan.action === 'noop') {
        summary.writes.noop++
      } else {
        actionable.push({ employeeId: empId, workDate: new Date(`${k}T00:00:00.000Z`), plan })
      }
    }
  }

  // Fase de ejecución (I/O), en chunks -> transacciones acotadas. `executePlanBatch`
  // batchea las ALTAS del lote con createMany (2 statements por lote, no 2 por
  // fila); los update/delete van por fila. Con eso el costo de un backfill pasa
  // a O(lotes) y entra holgado en maxDuration=60. El `timeout` subido es el
  // cinturón. Juntos matan el bug #1 (transacción >5s -> 500). Ver config.ts.
  for (let i = 0; i < actionable.length; i += chunkSize) {
    const chunk = actionable.slice(i, i + chunkSize)
    await db.$transaction(async (tx) => executePlanBatch(tx, chunk, actorId), {
      maxWait: SWEEP_DEFAULTS.txTimeoutMs,
      timeout: SWEEP_DEFAULTS.txTimeoutMs,
    })
    // Conteo tras el commit (solo los que escriben; los noop no llegan acá).
    for (const item of chunk) {
      if (item.plan.action === 'create') summary.writes.created++
      else if (item.plan.action === 'update') summary.writes.updated++
      else if (item.plan.action === 'delete') summary.writes.deleted++
    }
  }

  return summary
}

/**
 * Recálculo PUNTUAL de un (empleado, día). Se llama cuando cambia el status de
 * una asignación o se toca un TimeEntry, sin esperar al cron nocturno (que es
 * la red, no el único mecanismo).
 */
export async function recalculate(
  db: Db,
  employeeId: string,
  workDate: Date,
  actorId: string | null = null,
): Promise<Plan['action']> {
  const k = dateKey(workDate)

  const [schedules, assignments, entries, leaves, holiday, existing] = await Promise.all([
    db.workSchedule.findMany({
      where: { employeeId, deletedAt: null },
      select: { dayOfWeek: true, startMinute: true, endMinute: true, effectiveFrom: true, effectiveTo: true },
    }),
    db.eventAssignment.findMany({
      where: { employeeId, deletedAt: null, workDate },
      select: { startAt: true, endAt: true, status: true, workDate: true },
    }),
    db.timeEntry.findMany({
      where: { employeeId, deletedAt: null, workDate },
      select: { checkIn: true, checkOut: true, workDate: true },
    }),
    db.leaveRequest.findMany({
      where: { employeeId, deletedAt: null, status: 'APPROVED', dateFrom: { lte: workDate }, dateTo: { gte: workDate } },
      select: { type: true, dateFrom: true, dateTo: true },
    }),
    db.holiday.findFirst({ where: { date: workDate }, select: { id: true } }),
    db.attendance.findFirst({
      where: { employeeId, workDate },
      select: { id: true, status: true, source: true, workedMinutes: true, expectedMinutes: true, warnings: true },
    }),
  ])

  const input = buildInput({ key: k, employeeId, schedules, assignments, entries, leaves, isHoliday: holiday !== null })
  const result = resolveAttendance(input)
  const existingRow: ExistingRow | null = existing
    ? {
        id: existing.id,
        status: existing.status,
        source: existing.source as ExistingRow['source'],
        workedMinutes: existing.workedMinutes,
        expectedMinutes: existing.expectedMinutes,
        warnings: existing.warnings,
      }
    : null
  const plan = planAttendance(result, existingRow)

  if (plan.action !== 'noop') {
    await db.$transaction(async (tx) => {
      await executePlan(tx, plan, employeeId, workDate, actorId)
    })
  }
  return plan.action
}

function push<T>(map: Map<string, T[]>, k: string, v: T): void {
  const arr = map.get(k)
  if (arr) arr.push(v)
  else map.set(k, [v])
}
