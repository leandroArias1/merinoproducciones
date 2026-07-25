import { describe, it, expect } from 'vitest'
import { computeEventProfit, type EventProfit } from './finance'

/**
 * Un test por fila de la TABLA DE DECISIÓN de rentabilidad.
 * Montos en centavos: 1.000.000 pesos = 100_000_000 c.
 */

const P1M = 100_000_000n // 1.000.000
const P500k = 50_000_000n
const C400k = 40_000_000n
const C300k = 30_000_000n
const C700k = 70_000_000n
const C100k = 10_000_000n

/** Invariante: profit == income − cost, siempre. */
function assertInvariant(r: EventProfit) {
  expect(r.profitCents).toBe(r.incomeCents - r.costCents)
}

describe('computeEventProfit — tabla de decisión', () => {
  it('fila 1: normal (pactado 1M, costos 400k) → ganancia 600k, margen 60%', () => {
    const r = computeEventProfit({ agreedCents: P1M, costCents: C400k })
    expect(r).toEqual({ hasPrice: true, incomeCents: P1M, costCents: C400k, profitCents: 60_000_000n, marginPct: 60 })
    assertInvariant(r)
  })

  it('fila 2: sin gastos → ganancia = ingreso, margen 100%', () => {
    const r = computeEventProfit({ agreedCents: P1M, costCents: 0n })
    expect(r).toMatchObject({ hasPrice: true, profitCents: P1M, marginPct: 100 })
    assertInvariant(r)
  })

  it('fila 3: solo gastos, SIN precio (agreedCents null) → hasPrice false, income 0, margen null', () => {
    const r = computeEventProfit({ agreedCents: null, costCents: C300k })
    expect(r).toEqual({ hasPrice: false, incomeCents: 0n, costCents: C300k, profitCents: -30_000_000n, marginPct: null })
    assertInvariant(r)
  })

  it('fila 4: pagos parciales → la rentabilidad usa PACTADO, no lo cobrado', () => {
    // La función NO recibe "cobrado": el pago parcial es irrelevante para la
    // ganancia. Mismo pactado + costos que la fila 1 → misma ganancia 600k.
    const r = computeEventProfit({ agreedCents: P1M, costCents: C400k })
    expect(r.profitCents).toBe(60_000_000n) // NO 0 aunque se haya cobrado menos
    expect(r.marginPct).toBe(60)
    assertInvariant(r)
  })

  it('fila 5: pérdida (costos > precio) → ganancia negativa, margen negativo', () => {
    const r = computeEventProfit({ agreedCents: P500k, costCents: C700k })
    expect(r).toMatchObject({ profitCents: -20_000_000n, marginPct: -40 })
    assertInvariant(r)
  })

  it('fila 6: ingreso 0 con precio pactado en 0 → margen null (no dividir por 0)', () => {
    const r = computeEventProfit({ agreedCents: 0n, costCents: C100k })
    expect(r).toEqual({ hasPrice: true, incomeCents: 0n, costCents: C100k, profitCents: -10_000_000n, marginPct: null })
    assertInvariant(r)
  })

  it('margen con decimales redondea a 2 (pactado 300k, costos 100k → 66.67%)', () => {
    const r = computeEventProfit({ agreedCents: C300k, costCents: C100k })
    expect(r.profitCents).toBe(20_000_000n)
    expect(r.marginPct).toBe(66.67)
    assertInvariant(r)
  })
})
