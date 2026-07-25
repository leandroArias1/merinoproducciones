import { describe, it, expect } from 'vitest'
import { efectoEnElMes } from './raise-preview'

/**
 * El preview del aumento tiene que dar lo MISMO que después liquida el dominio.
 * Si miente, el papá elige una fecha creyendo una cosa y el recibo sale por
 * otra. Los casos son los que ya validamos a mano contra el sistema real.
 */
describe('preview del aumento: efecto en el mes', () => {
  it('desde el día 1: sueldo completo', () => {
    const e = efectoEnElMes('2026-07-01', 750_000)!
    expect(e.completo).toBe(true)
    expect(e.diasVigentes).toBe(31)
    expect(e.cobra).toBe(750_000)
  })

  it('desde el 25/07 (31 días): 7 de 31 — el caso que ya validamos en prod', () => {
    const e = efectoEnElMes('2026-07-25', 750_000)!
    expect(e.completo).toBe(false)
    expect(e.diasVigentes).toBe(7)
    expect(e.diasDelMes).toBe(31)
    expect(e.cobra).toBe(169_355) // 750.000 × 7/31 = 169.354,8 → 169.355
  })

  it('media jornada desde el 25/07: mismos días, otro sueldo', () => {
    expect(efectoEnElMes('2026-07-25', 500_000)!.cobra).toBe(112_903) // 500.000 × 7/31
  })

  it('meses de 30 días y febrero: usa los días reales del mes', () => {
    expect(efectoEnElMes('2026-09-16', 750_000)!.diasDelMes).toBe(30)
    expect(efectoEnElMes('2026-09-16', 750_000)!.diasVigentes).toBe(15)
    expect(efectoEnElMes('2026-02-01', 750_000)!.diasDelMes).toBe(28)
    expect(efectoEnElMes('2028-02-01', 750_000)!.diasDelMes).toBe(29) // bisiesto
  })

  it('el último día del mes: un solo día vigente', () => {
    const e = efectoEnElMes('2026-07-31', 750_000)!
    expect(e.diasVigentes).toBe(1)
    expect(e.cobra).toBe(24_194) // 750.000 / 31
  })

  it('fecha inválida: no inventa un efecto', () => {
    expect(efectoEnElMes('', 750_000)).toBeNull()
  })
})
