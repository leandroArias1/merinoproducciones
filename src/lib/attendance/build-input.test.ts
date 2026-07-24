import { describe, it, expect } from 'vitest'
import { buildInput } from './sweep'
import { workDateFromKey } from './timezone'

// buildInput es puro (no toca DB): corre en `pnpm test` (unit).
const KEY = '2026-08-14' // jueves
const dowThu = new Date(`${KEY}T12:00:00-03:00`).getDay() // 4

const sched = (startMinute: number, endMinute: number) => ({
  dayOfWeek: dowThu,
  startMinute,
  endMinute,
  effectiveFrom: workDateFromKey('2026-01-01'),
  effectiveTo: null,
})

describe('buildInput — turno partido', () => {
  it('TIRA ERROR si hay más de un tramo de WorkSchedule el mismo día', () => {
    expect(() =>
      buildInput({
        key: KEY,
        employeeId: 'emp-1',
        schedules: [sched(540, 720), sched(840, 1020)], // dos tramos
        assignments: [],
        entries: [],
        leaves: [],
        isHoliday: false,
      }),
    ).toThrow(/Turno partido no soportado/)
  })

  it('un solo tramo resuelve el intervalo habitual normalmente', () => {
    const input = buildInput({
      key: KEY,
      schedules: [sched(540, 1020)], // 09:00-17:00
      assignments: [],
      entries: [],
      leaves: [],
      isHoliday: false,
    })
    expect(input.habitualInterval).not.toBeNull()
  })

  it('sin tramos ese día → habitualInterval null (no rompe)', () => {
    const input = buildInput({
      key: KEY,
      schedules: [{ ...sched(540, 1020), dayOfWeek: (dowThu + 1) % 7 }], // otro día
      assignments: [],
      entries: [],
      leaves: [],
      isHoliday: false,
    })
    expect(input.habitualInterval).toBeNull()
  })
})
