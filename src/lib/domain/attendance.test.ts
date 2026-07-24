import { describe, it, expect } from 'vitest'
import {
  resolveAttendance,
  type AttendanceInput,
  type AssignmentInput,
  type AssignmentStatus,
  type Interval,
  type TimeEntryInput,
} from './attendance'
import { DEFAULT_ATTENDANCE_CONFIG } from './attendance-config'

// ── Helpers ──
const cfg = DEFAULT_ATTENDANCE_CONFIG // tolerancia = 10 min
const d = (s: string) => new Date(s)
const iv = (a: string, b: string): Interval => ({ start: d(a), end: d(b) })
const asg = (a: string, b: string, status: AssignmentStatus): AssignmentInput => ({
  start: d(a),
  end: d(b),
  status,
})
const te = (a: string, b: string | null): TimeEntryInput => ({
  checkIn: d(a),
  checkOut: b === null ? null : d(b),
})
function input(over: Partial<AttendanceInput>): AttendanceInput {
  return {
    habitualInterval: null,
    assignments: [],
    approvedLeave: null,
    isHoliday: false,
    timeEntries: [],
    config: cfg,
    ...over,
  }
}

// Día base (los instantes son UTC; al motor no le importa el huso).
const DAY = '2026-08-14'
const NEXT = '2026-08-15'
const at = (day: string, hhmm: string) => `${day}T${hhmm}:00.000Z`

describe('resolveAttendance — rama A (sin expectativa)', () => {
  it('A1: L-M un jueves, sin nada → NO genera registro', () => {
    const r = resolveAttendance(input({}))
    expect(r.record).toBe(false)
    if (!r.record) expect(r.reason).toBe('SIN_EXPECTATIVA_SIN_ACTIVIDAD')
  })

  it('A2: sin turno pero fichó completo → PRESENT, expected 0, worked real', () => {
    const r = resolveAttendance(input({ timeEntries: [te(at(DAY, '09:00'), at(DAY, '13:00'))] }))
    expect(r).toMatchObject({ record: true, status: 'PRESENT', expectedMinutes: 0, workedMinutes: 240 })
    if (r.record) expect(r.warnings).toContain('TRABAJO_SIN_TURNO')
  })

  it('A3: sin turno con fichada abierta → INCOMPLETE', () => {
    const r = resolveAttendance(input({ timeEntries: [te(at(DAY, '09:00'), null)] }))
    expect(r).toMatchObject({ record: true, status: 'INCOMPLETE', expectedMinutes: 0, workedMinutes: 0 })
    if (r.record) expect(r.warnings).toEqual(expect.arrayContaining(['TRABAJO_SIN_TURNO', 'FICHADA_ABIERTA']))
  })
})

describe('resolveAttendance — rama B (horario habitual)', () => {
  const hab = iv(at(DAY, '09:00'), at(DAY, '17:00')) // 480 min

  it('B1: horario, sin fichadas → ABSENT', () => {
    const r = resolveAttendance(input({ habitualInterval: hab }))
    expect(r).toMatchObject({ record: true, status: 'ABSENT', expectedMinutes: 480, workedMinutes: 0 })
  })

  it('B2: entró en hora, jornada completa → PRESENT sin warnings', () => {
    const r = resolveAttendance(input({ habitualInterval: hab, timeEntries: [te(at(DAY, '09:00'), at(DAY, '17:00'))] }))
    expect(r).toMatchObject({ record: true, status: 'PRESENT', expectedMinutes: 480, workedMinutes: 480 })
    if (r.record) expect(r.warnings).toEqual([])
  })

  it('B3: entró tarde más que la tolerancia → LATE', () => {
    const r = resolveAttendance(input({ habitualInterval: hab, timeEntries: [te(at(DAY, '09:20'), at(DAY, '17:00'))] }))
    expect(r).toMatchObject({ record: true, status: 'LATE', expectedMinutes: 480, workedMinutes: 460 })
  })

  it('B3b: tarde DENTRO de la tolerancia (10 min) → sigue PRESENT', () => {
    const r = resolveAttendance(input({ habitualInterval: hab, timeEntries: [te(at(DAY, '09:10'), at(DAY, '17:00'))] }))
    expect(r).toMatchObject({ record: true, status: 'PRESENT' })
  })

  it('B4: en hora pero se fue temprano → PRESENT + JORNADA_CORTA', () => {
    const r = resolveAttendance(input({ habitualInterval: hab, timeEntries: [te(at(DAY, '09:00'), at(DAY, '13:00'))] }))
    expect(r).toMatchObject({ record: true, status: 'PRESENT', workedMinutes: 240 })
    if (r.record) expect(r.warnings).toContain('JORNADA_CORTA')
  })

  it('B5: fichada abierta en día con horario → INCOMPLETE', () => {
    const r = resolveAttendance(input({ habitualInterval: hab, timeEntries: [te(at(DAY, '09:00'), null)] }))
    expect(r).toMatchObject({ record: true, status: 'INCOMPLETE', expectedMinutes: 480 })
    if (r.record) expect(r.warnings).toContain('FICHADA_ABIERTA')
  })

  it('B6: fichadas solapadas → se fusionan (no doble) + warning', () => {
    const r = resolveAttendance(
      input({
        habitualInterval: hab,
        timeEntries: [te(at(DAY, '09:00'), at(DAY, '13:00')), te(at(DAY, '12:00'), at(DAY, '17:00'))],
      }),
    )
    expect(r).toMatchObject({ record: true, status: 'PRESENT', workedMinutes: 480 }) // no 540
    if (r.record) expect(r.warnings).toContain('FICHADAS_SOLAPADAS')
  })
})

describe('resolveAttendance — rama C (asignaciones a evento)', () => {
  const armado = (s: AssignmentStatus) => asg(at(DAY, '08:00'), at(DAY, '18:00'), s) // 600
  const show = (s: AssignmentStatus) => asg(at(DAY, '20:00'), at(NEXT, '00:00'), s) // 240, cruza medianoche

  it('C1a: asignación COMPLETED sin fichada → PRESENT, worked = expected (confirmado)', () => {
    const r = resolveAttendance(input({ assignments: [armado('COMPLETED')] }))
    expect(r).toMatchObject({ record: true, status: 'PRESENT', expectedMinutes: 600, workedMinutes: 600 })
    if (r.record) expect(r.warnings).toContain('SIN_FICHADA_CONFIRMADO_POR_SUPERVISOR')
  })

  it('C1b: asignación CONFIRMED sin fichada → UNVERIFIED (no PRESENT gratis)', () => {
    const r = resolveAttendance(input({ assignments: [armado('CONFIRMED')] }))
    expect(r).toMatchObject({ record: true, status: 'UNVERIFIED', expectedMinutes: 600, workedMinutes: 0 })
  })

  it('C1b2: asignación PLANNED sin fichada → UNVERIFIED', () => {
    const r = resolveAttendance(input({ assignments: [armado('PLANNED')] }))
    expect(r).toMatchObject({ record: true, status: 'UNVERIFIED' })
  })

  it('C2: asignación con fichada en hora → PRESENT', () => {
    const r = resolveAttendance(
      input({ assignments: [armado('CONFIRMED')], timeEntries: [te(at(DAY, '08:00'), at(DAY, '18:00'))] }),
    )
    expect(r).toMatchObject({ record: true, status: 'PRESENT', expectedMinutes: 600, workedMinutes: 600 })
  })

  it('C3: asignación con fichada tarde → LATE', () => {
    const r = resolveAttendance(
      input({ assignments: [armado('CONFIRMED')], timeEntries: [te(at(DAY, '08:30'), at(DAY, '18:00'))] }),
    )
    expect(r).toMatchObject({ record: true, status: 'LATE', workedMinutes: 570 })
  })

  it('C4: asignación con fichada abierta → INCOMPLETE', () => {
    const r = resolveAttendance(
      input({ assignments: [armado('CONFIRMED')], timeEntries: [te(at(DAY, '08:00'), null)] }),
    )
    expect(r).toMatchObject({ record: true, status: 'INCOMPLETE', expectedMinutes: 600 })
  })

  it('C4b: fichada abierta gana sobre un intervalo UNVERIFIED (INCOMPLETE > UNVERIFIED)', () => {
    const r = resolveAttendance(
      input({
        assignments: [armado('CONFIRMED'), show('CONFIRMED')],
        timeEntries: [te(at(DAY, '08:00'), null)],
      }),
    )
    expect(r).toMatchObject({ record: true, status: 'INCOMPLETE' })
  })

  it('C5 (Cardozo 14/08): dos asignaciones el mismo día → expected suma ambas', () => {
    const r = resolveAttendance(
      input({
        assignments: [armado('CONFIRMED'), show('CONFIRMED')],
        timeEntries: [te(at(DAY, '08:00'), at(DAY, '18:00')), te(at(DAY, '20:00'), at(NEXT, '00:00'))],
      }),
    )
    expect(r).toMatchObject({ record: true, status: 'PRESENT', expectedMinutes: 840, workedMinutes: 840 })
  })

  it('CAMBIO 4 — saltea el armado, ficha el show en hora → UNVERIFIED, NUNCA LATE (no 12h tarde)', () => {
    const r = resolveAttendance(
      input({
        assignments: [armado('CONFIRMED'), show('CONFIRMED')],
        timeEntries: [te(at(DAY, '20:00'), at(NEXT, '00:00'))], // solo el show, en hora
      }),
    )
    expect(r.record).toBe(true)
    if (r.record) {
      expect(r.status).not.toBe('LATE') // el bug que se corrige
      expect(r.status).toBe('UNVERIFIED') // el armado quedó sin cubrir
      expect(r.expectedMinutes).toBe(840)
      expect(r.workedMinutes).toBe(240)
    }
  })

  it('CAMBIO 4 — tardanza por intervalo: armado en hora, show tarde → LATE (solo por el show)', () => {
    const r = resolveAttendance(
      input({
        assignments: [armado('CONFIRMED'), show('CONFIRMED')],
        timeEntries: [te(at(DAY, '08:00'), at(DAY, '18:00')), te(at(DAY, '20:40'), at(NEXT, '00:00'))],
      }),
    )
    expect(r).toMatchObject({ record: true, status: 'LATE', expectedMinutes: 840, workedMinutes: 800 })
  })

  it('C6: licencia que solapa una asignación → gana la ASIGNACIÓN + warning', () => {
    const r = resolveAttendance(
      input({
        assignments: [armado('CONFIRMED')],
        approvedLeave: { type: 'VACATION' },
        timeEntries: [te(at(DAY, '08:00'), at(DAY, '18:00'))],
      }),
    )
    expect(r.record).toBe(true)
    if (r.record) {
      expect(r.status).toBe('PRESENT') // NO ON_LEAVE
      expect(r.warnings).toContain('LICENCIA_SOLAPA_ASIGNACION')
    }
  })

  it('C7: asignación en feriado → se trabaja + warning TRABAJO_EN_FERIADO', () => {
    const r = resolveAttendance(
      input({
        assignments: [armado('COMPLETED')],
        isHoliday: true,
      }),
    )
    expect(r.record).toBe(true)
    if (r.record) {
      expect(r.status).toBe('PRESENT')
      expect(r.warnings).toContain('TRABAJO_EN_FERIADO')
    }
  })
})

describe('resolveAttendance — CAMBIO 2 (asignaciones canceladas)', () => {
  it('C8: solo una asignación CANCELLED, nada más → NO genera registro', () => {
    const r = resolveAttendance(input({ assignments: [asg(at(DAY, '08:00'), at(DAY, '18:00'), 'CANCELLED')] }))
    expect(r.record).toBe(false)
  })

  it("C8': asignación CANCELLED + fichada → se ignora la asignación (expected 0, no 600)", () => {
    const r = resolveAttendance(
      input({
        assignments: [asg(at(DAY, '08:00'), at(DAY, '18:00'), 'CANCELLED')],
        timeEntries: [te(at(DAY, '09:00'), at(DAY, '13:00'))],
      }),
    )
    expect(r).toMatchObject({ record: true, status: 'PRESENT', expectedMinutes: 0, workedMinutes: 240 })
    if (r.record) expect(r.warnings).toContain('TRABAJO_SIN_TURNO')
  })

  it("C8'': CANCELLED + COMPLETED → expected solo cuenta la activa", () => {
    const r = resolveAttendance(
      input({
        assignments: [
          asg(at(DAY, '08:00'), at(DAY, '18:00'), 'CANCELLED'), // 600, se ignora
          asg(at(DAY, '20:00'), at(NEXT, '00:00'), 'COMPLETED'), // 240, activa
        ],
      }),
    )
    expect(r).toMatchObject({ record: true, status: 'PRESENT', expectedMinutes: 240, workedMinutes: 240 })
  })
})

describe('resolveAttendance — rama D (licencia)', () => {
  it('D1: licencia aprobada, sin fichadas → ON_LEAVE, expected 0', () => {
    const r = resolveAttendance(input({ approvedLeave: { type: 'VACATION' } }))
    expect(r).toMatchObject({ record: true, status: 'ON_LEAVE', expectedMinutes: 0, workedMinutes: 0 })
  })

  it('D2: trabajó durante la licencia → ON_LEAVE + warning', () => {
    const r = resolveAttendance(
      input({ approvedLeave: { type: 'SICK' }, timeEntries: [te(at(DAY, '09:00'), at(DAY, '13:00'))] }),
    )
    expect(r).toMatchObject({ record: true, status: 'ON_LEAVE', workedMinutes: 240 })
    if (r.record) expect(r.warnings).toContain('TRABAJO_EN_LICENCIA')
  })

  it('D3: licencia en un feriado → gana la LICENCIA (ON_LEAVE)', () => {
    const r = resolveAttendance(input({ approvedLeave: { type: 'VACATION' }, isHoliday: true }))
    expect(r).toMatchObject({ record: true, status: 'ON_LEAVE' })
  })
})

describe('resolveAttendance — rama E (feriado)', () => {
  it('E1: feriado, sin fichadas → HOLIDAY, expected 0', () => {
    const r = resolveAttendance(input({ isHoliday: true }))
    expect(r).toMatchObject({ record: true, status: 'HOLIDAY', expectedMinutes: 0, workedMinutes: 0 })
  })

  it('E2: trabajó en feriado → HOLIDAY + warning', () => {
    const r = resolveAttendance(
      input({ isHoliday: true, timeEntries: [te(at(DAY, '09:00'), at(DAY, '13:00'))] }),
    )
    expect(r).toMatchObject({ record: true, status: 'HOLIDAY', workedMinutes: 240 })
    if (r.record) expect(r.warnings).toContain('TRABAJO_EN_FERIADO')
  })
})

describe('resolveAttendance — merge y solape de TimeEntry', () => {
  it('adyacentes (fin == inicio) → se fusionan SIN warning de solape', () => {
    const r = resolveAttendance(
      input({ timeEntries: [te(at(DAY, '09:00'), at(DAY, '12:00')), te(at(DAY, '12:00'), at(DAY, '15:00'))] }),
    )
    expect(r).toMatchObject({ record: true, workedMinutes: 360 })
    if (r.record) expect(r.warnings).not.toContain('FICHADAS_SOLAPADAS')
  })

  it('con hueco → se SUMAN los dos tramos', () => {
    const r = resolveAttendance(
      input({ timeEntries: [te(at(DAY, '09:00'), at(DAY, '11:00')), te(at(DAY, '13:00'), at(DAY, '15:00'))] }),
    )
    expect(r).toMatchObject({ record: true, workedMinutes: 240 })
    if (r.record) expect(r.warnings).not.toContain('FICHADAS_SOLAPADAS')
  })

  it('uno contenido en el otro → cuenta el mayor, marca solape', () => {
    const r = resolveAttendance(
      input({ timeEntries: [te(at(DAY, '09:00'), at(DAY, '17:00')), te(at(DAY, '10:00'), at(DAY, '12:00'))] }),
    )
    expect(r).toMatchObject({ record: true, workedMinutes: 480 })
    if (r.record) expect(r.warnings).toContain('FICHADAS_SOLAPADAS')
  })
})
