import { describe, it, expect } from 'vitest'
import { computePayrollItem, type PayrollInput, type PayrollResult } from './payroll'

/**
 * Un test por fila de la TABLA DE DECISIÓN aprobada (bordes incluidos).
 * Montos en centavos: 750.000 pesos = 75_000_000 c; 30.000 = 3_000_000 c.
 */

const LV = 75_000_000n // Jornada completa L-V
const LM = 50_000_000n // Media jornada L-M
const DED = 3_000_000n // descuento por falta

// Helper con defaults de "mes completo de 30 días, sin bloqueo".
function input(over: Partial<PayrollInput>): PayrollInput {
  return {
    daysInMonth: 30,
    segments: [{ label: 'L-V', monthlyCents: LV, activeDays: 30 }],
    absentDays: 0,
    deductionPerAbsentCents: DED,
    blocked: false,
    ...over,
  }
}

/** Invariante clave: la suma de las líneas del recibo == neto. */
function assertLinesSumToNet(r: PayrollResult) {
  if (r.status !== 'OK') return
  const sum = r.lines.reduce((acc, l) => acc + l.amountCents, 0n)
  expect(sum).toBe(r.netCents)
}

describe('computePayrollItem — tabla de decisión', () => {
  it('fila 1: mes completo, sin faltas (L-V)', () => {
    const r = computePayrollItem(input({}))
    expect(r).toMatchObject({ status: 'OK', baseCents: 75_000_000n, deductionCents: 0n, netCents: 75_000_000n })
    if (r.status === 'OK') {
      expect(r.lines).toHaveLength(1)
      expect(r.lines[0]).toMatchObject({ kind: 'BASE', amountCents: 75_000_000n })
    }
    assertLinesSumToNet(r)
  })

  it('fila 2: mes completo, 2 faltas (L-V) → −60.000', () => {
    const r = computePayrollItem(input({ absentDays: 2 }))
    expect(r).toMatchObject({ status: 'OK', deductionCents: 6_000_000n, netCents: 69_000_000n })
    if (r.status === 'OK') expect(r.lines.find((l) => l.kind === 'DEDUCTION')?.amountCents).toBe(-6_000_000n)
    assertLinesSumToNet(r)
  })

  it('fila 3: media jornada, 3 faltas (L-M) → 410.000', () => {
    const r = computePayrollItem(input({ segments: [{ label: 'L-M', monthlyCents: LM, activeDays: 30 }], absentDays: 3 }))
    expect(r).toMatchObject({ status: 'OK', baseCents: 50_000_000n, deductionCents: 9_000_000n, netCents: 41_000_000n })
    assertLinesSumToNet(r)
  })

  it('fila 4: todas las faltas posibles L-M (13) → 110.000, sigue positivo', () => {
    const r = computePayrollItem(input({ segments: [{ label: 'L-M', monthlyCents: LM, activeDays: 30 }], absentDays: 13 }))
    expect(r).toMatchObject({ status: 'OK', netCents: 11_000_000n })
    if (r.status === 'OK') expect(r.flooredToZero).toBe(false)
    assertLinesSumToNet(r)
  })

  it('fila 5 (guarda): descuento supera el base → neto 0 y flooredToZero', () => {
    // 17 faltas es imposible con datos reales (tope L-M ~13); guarda defensiva.
    const r = computePayrollItem(input({ segments: [{ label: 'L-M', monthlyCents: LM, activeDays: 30 }], absentDays: 17 }))
    expect(r).toMatchObject({ status: 'OK', netCents: 0n })
    if (r.status === 'OK') {
      expect(r.flooredToZero).toBe(true)
      expect(r.lines.some((l) => l.kind === 'ADJUSTMENT')).toBe(true)
    }
    assertLinesSumToNet(r) // sigue cerrando en 0
  })

  it('fila 6: ingreso a mitad de mes (día 16, L-V), sin faltas → 375.000 proporcional', () => {
    const r = computePayrollItem(input({ segments: [{ label: 'L-V', monthlyCents: LV, activeDays: 15 }] }))
    expect(r).toMatchObject({ status: 'OK', baseCents: 37_500_000n, netCents: 37_500_000n })
    if (r.status === 'OK') expect(r.lines[0].concept).toMatch(/proporcional 15\/30/)
    assertLinesSumToNet(r)
  })

  it('fila 7: baja a mitad de mes (día 15, L-V), 1 falta → 345.000', () => {
    const r = computePayrollItem(input({ segments: [{ label: 'L-V', monthlyCents: LV, activeDays: 15 }], absentDays: 1 }))
    expect(r).toMatchObject({ status: 'OK', baseCents: 37_500_000n, deductionCents: 3_000_000n, netCents: 34_500_000n })
    assertLinesSumToNet(r)
  })

  it('fila 8: cambio de categoría a mitad de mes (L-M 1-15 + L-V 16-30), 2 faltas → 565.000', () => {
    const r = computePayrollItem(
      input({
        segments: [
          { label: 'L-M', monthlyCents: LM, activeDays: 15 },
          { label: 'L-V', monthlyCents: LV, activeDays: 15 },
        ],
        absentDays: 2,
      }),
    )
    expect(r).toMatchObject({ status: 'OK', baseCents: 62_500_000n, deductionCents: 6_000_000n, netCents: 56_500_000n })
    if (r.status === 'OK') {
      const bases = r.lines.filter((l) => l.kind === 'BASE')
      expect(bases).toHaveLength(2)
      expect(bases[0].amountCents).toBe(25_000_000n) // L-M 15/30
      expect(bases[1].amountCents).toBe(37_500_000n) // L-V 15/30
    }
    assertLinesSumToNet(r)
  })

  it('fila 9: inactivo/suspendido todo el mes (sin tramos) → base 0, neto 0', () => {
    const r = computePayrollItem(input({ segments: [], absentDays: 0 }))
    expect(r).toMatchObject({ status: 'OK', baseCents: 0n, netCents: 0n })
    if (r.status === 'OK') expect(r.lines).toHaveLength(0)
    assertLinesSumToNet(r)
  })

  it('fila 10: mes con días sin resolver → BLOQUEADO (sin recibo)', () => {
    const r = computePayrollItem(input({ blocked: true, absentDays: 3 }))
    expect(r.status).toBe('BLOCKED')
  })

  it('aclaración papá: L-M que ingresa el día 16, sin faltas → 250.000 proporcional', () => {
    const r = computePayrollItem(input({ segments: [{ label: 'L-M', monthlyCents: LM, activeDays: 15 }] }))
    expect(r).toMatchObject({ status: 'OK', baseCents: 25_000_000n, netCents: 25_000_000n })
    assertLinesSumToNet(r)
  })

  it('proración redondea al centavo (mes de 31 días)', () => {
    // 75_000_000 * 15 / 31 = 36_290_322.58 → 36_290_323 (half-up).
    const r = computePayrollItem(input({ daysInMonth: 31, segments: [{ label: 'L-V', monthlyCents: LV, activeDays: 15 }] }))
    if (r.status === 'OK') expect(r.baseCents).toBe(36_290_323n)
    assertLinesSumToNet(r)
  })

  it('dos tramos prorrateados en mes de 31 días: los centavos cierran exacto', () => {
    // L-M 15/31 = 750_000_000/31 = 24_193_548.39 → 24_193_548 (down)
    // L-V 16/31 = 1_200_000_000/31 = 38_709_677.42 → 38_709_677 (down)
    // base = 62_903_225 ; 1 falta (−3_000_000) → neto 59_903_225
    const r = computePayrollItem(
      input({
        daysInMonth: 31,
        segments: [
          { label: 'L-M', monthlyCents: LM, activeDays: 15 },
          { label: 'L-V', monthlyCents: LV, activeDays: 16 },
        ],
        absentDays: 1,
      }),
    )
    expect(r).toMatchObject({ status: 'OK', baseCents: 62_903_225n, netCents: 59_903_225n })
    if (r.status === 'OK') {
      const bases = r.lines.filter((l) => l.kind === 'BASE').map((l) => l.amountCents)
      expect(bases).toEqual([24_193_548n, 38_709_677n])
    }
    assertLinesSumToNet(r) // ni se pierde ni sobra 1 centavo entre líneas y neto
  })
})
