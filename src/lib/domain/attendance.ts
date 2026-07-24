import type { AttendanceConfig } from './attendance-config'

/**
 * Motor de asistencia — FUNCIÓN PURA por (empleado, workDate).
 *
 * Sin Prisma, sin I/O, sin Date.now(): recibe datos planos ya resueltos por
 * el caller (instantes concretos, turnos ya bucketeados por workDate) y
 * devuelve el resumen del día. La resolución de zona horaria y el cruce de
 * medianoche pasan en el borde, no acá.
 *
 * Tipos desacoplados de Prisma a propósito (el dominio no importa el client).
 */

export type AssignmentStatus = 'PLANNED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED'
export type LeaveType = 'VACATION' | 'SICK' | 'UNPAID' | 'SPECIAL'

export interface Interval {
  start: Date
  end: Date
}

export interface AssignmentInput extends Interval {
  status: AssignmentStatus
}

export interface TimeEntryInput {
  checkIn: Date
  checkOut: Date | null // null = fichada abierta (no cerró)
}

export interface AttendanceInput {
  /** Horario habitual resuelto a instantes para ESTE día, o null si ese día no trabaja. */
  habitualInterval: Interval | null
  /** Asignaciones a evento imputadas a este workDate, con su status. */
  assignments: AssignmentInput[]
  /** Licencia aprobada que cubre el día, o null. */
  approvedLeave: { type: LeaveType } | null
  isHoliday: boolean
  /** Fichadas imputadas a este workDate. */
  timeEntries: TimeEntryInput[]
  config: AttendanceConfig
}

/** El motor emite este subconjunto. Nunca JUSTIFIED (ese es manual). */
export type EngineStatus =
  | 'PRESENT'
  | 'ABSENT'
  | 'LATE'
  | 'ON_LEAVE'
  | 'HOLIDAY'
  | 'INCOMPLETE'
  | 'UNVERIFIED'

export type Warning =
  | 'FICHADA_ABIERTA'
  | 'FICHADAS_SOLAPADAS'
  | 'SIN_FICHADA_CONFIRMADO_POR_SUPERVISOR'
  | 'LICENCIA_SOLAPA_ASIGNACION'
  | 'TRABAJO_SIN_TURNO'
  | 'TRABAJO_EN_FERIADO'
  | 'TRABAJO_EN_LICENCIA'
  | 'JORNADA_CORTA'

export type AttendanceResult =
  | { record: false; reason: 'SIN_EXPECTATIVA_SIN_ACTIVIDAD' }
  | {
      record: true
      status: EngineStatus
      expectedMinutes: number
      workedMinutes: number
      warnings: Warning[]
    }

// ── Helpers puros ────────────────────────────────────────────────────────────

const MS_PER_MIN = 60_000

function toMinutes(ms: number): number {
  return Math.round(ms / MS_PER_MIN)
}

function durationMin(i: Interval): number {
  return toMinutes(i.end.getTime() - i.start.getTime())
}

interface Span {
  start: number
  end: number
}

function splitEntries(entries: TimeEntryInput[]): { complete: Span[]; hasOpen: boolean } {
  const complete: Span[] = []
  let hasOpen = false
  for (const e of entries) {
    if (e.checkOut === null) {
      hasOpen = true
      continue
    }
    complete.push({ start: e.checkIn.getTime(), end: e.checkOut.getTime() })
  }
  return { complete, hasOpen }
}

/**
 * Fusiona los intervalos completos (unión) y suma minutos. Los solapes NO se
 * suman doble. `overlapped` = hubo solape estricto (probable doble fichaje).
 * Los tramos adyacentes (fin == inicio) se fusionan sin marcar solape.
 */
function mergeSpans(spans: Span[]): { workedMinutes: number; overlapped: boolean } {
  if (spans.length === 0) return { workedMinutes: 0, overlapped: false }
  const sorted = [...spans].sort((a, b) => a.start - b.start)
  let overlapped = false
  let totalMs = 0
  let curStart = sorted[0].start
  let curEnd = sorted[0].end
  for (let i = 1; i < sorted.length; i++) {
    const s = sorted[i]
    if (s.start < curEnd) {
      // solape estricto
      overlapped = true
      if (s.end > curEnd) curEnd = s.end
    } else if (s.start === curEnd) {
      // adyacente: fusiona, no es solape
      if (s.end > curEnd) curEnd = s.end
    } else {
      // hueco: cierra el tramo actual y abre uno nuevo
      totalMs += curEnd - curStart
      curStart = s.start
      curEnd = s.end
    }
  }
  totalMs += curEnd - curStart
  return { workedMinutes: toMinutes(totalMs), overlapped }
}

/** Fichadas completas que solapan el intervalo. */
function coveringSpans(spans: Span[], iv: Interval): Span[] {
  const start = iv.start.getTime()
  const end = iv.end.getTime()
  return spans.filter((s) => s.start < end && s.end > start)
}

function dedupe(ws: Warning[]): Warning[] {
  return [...new Set(ws)]
}

// ── Motor ────────────────────────────────────────────────────────────────────

export function resolveAttendance(input: AttendanceInput): AttendanceResult {
  const { habitualInterval, approvedLeave, isHoliday, timeEntries, config } = input

  // CAMBIO 2: las asignaciones CANCELLED no generan expectativa. Se descartan
  // acá dentro (no confiamos en que el caller las filtre).
  const activeAssignments = input.assignments.filter((a) => a.status !== 'CANCELLED')

  const { complete, hasOpen } = splitEntries(timeEntries)
  const merged = mergeSpans(complete)
  const workedFromEntries = merged.workedMinutes
  const tol = config.lateToleranceMinutes

  // ── Rama 1: ASIGNACIÓN activa (precedencia máxima; NUNCA ABSENT) ──
  if (activeAssignments.length > 0) {
    const warnings: Warning[] = []
    if (merged.overlapped) warnings.push('FICHADAS_SOLAPADAS')
    if (approvedLeave) warnings.push('LICENCIA_SOLAPA_ASIGNACION') // CAMBIO 1/C6
    if (isHoliday) warnings.push('TRABAJO_EN_FERIADO')

    const expectedMinutes = activeAssignments.reduce((sum, a) => sum + durationMin(a), 0)

    if (hasOpen) {
      warnings.push('FICHADA_ABIERTA')
      return build('INCOMPLETE', expectedMinutes, workedFromEntries, warnings)
    }

    // CAMBIO 4: evaluación POR INTERVALO (no contra el start más temprano).
    let anyLate = false
    let anyUnverified = false
    let confirmedCredit = 0
    for (const a of activeAssignments) {
      const covering = coveringSpans(complete, a)
      if (covering.length > 0) {
        const earliest = Math.min(...covering.map((s) => s.start))
        const lateMin = toMinutes(earliest - a.start.getTime())
        if (lateMin > tol) anyLate = true
      } else {
        // CAMBIO 1: intervalo sin fichada -> cadena de evidencia por status.
        if (a.status === 'COMPLETED') {
          confirmedCredit += durationMin(a)
          warnings.push('SIN_FICHADA_CONFIRMADO_POR_SUPERVISOR')
        } else {
          anyUnverified = true // PLANNED/CONFIRMED sin evidencia -> bloquea payroll
        }
      }
    }

    const workedMinutes = workedFromEntries + confirmedCredit
    // Precedencia: INCOMPLETE (arriba) > UNVERIFIED > LATE > PRESENT
    const status: EngineStatus = anyUnverified ? 'UNVERIFIED' : anyLate ? 'LATE' : 'PRESENT'
    return build(status, expectedMinutes, workedMinutes, warnings)
  }

  // ── Rama 2: LICENCIA aprobada (sin asignación) ──
  if (approvedLeave) {
    const warnings: Warning[] = []
    if (merged.overlapped) warnings.push('FICHADAS_SOLAPADAS')
    if (hasOpen) warnings.push('FICHADA_ABIERTA')
    if (workedFromEntries > 0 || hasOpen) warnings.push('TRABAJO_EN_LICENCIA')
    return build('ON_LEAVE', 0, workedFromEntries, warnings)
  }

  // ── Rama 3: FERIADO (sin asignación ni licencia) ──
  if (isHoliday) {
    const warnings: Warning[] = []
    if (merged.overlapped) warnings.push('FICHADAS_SOLAPADAS')
    if (hasOpen) warnings.push('FICHADA_ABIERTA')
    if (workedFromEntries > 0 || hasOpen) warnings.push('TRABAJO_EN_FERIADO')
    return build('HOLIDAY', 0, workedFromEntries, warnings)
  }

  // ── Rama 4: HORARIO habitual (día normal de trabajo) ──
  if (habitualInterval) {
    const warnings: Warning[] = []
    if (merged.overlapped) warnings.push('FICHADAS_SOLAPADAS')
    const expectedMinutes = durationMin(habitualInterval)

    if (hasOpen) {
      warnings.push('FICHADA_ABIERTA')
      return build('INCOMPLETE', expectedMinutes, workedFromEntries, warnings)
    }

    const covering = coveringSpans(complete, habitualInterval)
    if (covering.length === 0) {
      return build('ABSENT', expectedMinutes, 0, warnings)
    }
    const earliest = Math.min(...covering.map((s) => s.start))
    const lateMin = toMinutes(earliest - habitualInterval.start.getTime())
    const status: EngineStatus = lateMin > tol ? 'LATE' : 'PRESENT'
    // JORNADA_CORTA solo si está presente en hora y trabajó menos de lo
    // esperado por más que la tolerancia (no ensucia un PRESENT casi completo).
    if (status === 'PRESENT' && workedFromEntries < expectedMinutes - tol) {
      warnings.push('JORNADA_CORTA')
    }
    return build(status, expectedMinutes, workedFromEntries, warnings)
  }

  // ── Rama 5: sin expectativa (ej: categoría L-M un jueves) ──
  if (timeEntries.length === 0) {
    return { record: false, reason: 'SIN_EXPECTATIVA_SIN_ACTIVIDAD' }
  }
  // Fichó sin turno ni horario: se registra igual (horas fuera de plan).
  const warnings: Warning[] = ['TRABAJO_SIN_TURNO']
  if (merged.overlapped) warnings.push('FICHADAS_SOLAPADAS')
  if (hasOpen) {
    warnings.push('FICHADA_ABIERTA')
    return build('INCOMPLETE', 0, workedFromEntries, warnings)
  }
  return build('PRESENT', 0, workedFromEntries, warnings)
}

function build(
  status: EngineStatus,
  expectedMinutes: number,
  workedMinutes: number,
  warnings: Warning[],
): AttendanceResult {
  return { record: true, status, expectedMinutes, workedMinutes, warnings: dedupe(warnings) }
}
