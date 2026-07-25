/**
 * Motor de RENTABILIDAD por evento — FUNCIÓN PURA.
 *
 * Sin Prisma, sin I/O: recibe el precio PACTADO del evento y la suma de sus
 * gastos imputados, y devuelve ingreso/costo/ganancia/margen. Misma arquitectura
 * que asistencia y liquidación.
 *
 * Decisiones de negocio (Fase 3, confirmadas):
 *  - La rentabilidad se calcula sobre lo PACTADO (`agreedCents`), NO sobre lo
 *    cobrado. Mide la economía del trato, independiente de la cobranza. Lo
 *    cobrado/pendiente es flujo de caja y se muestra APARTE, no entra acá.
 *  - Los SUELDOS no se imputan a eventos → nunca aparecen en este cálculo.
 *  - Si no hay precio pactado (`agreedCents = null`), `hasPrice = false` e
 *    `incomeCents = 0` (la UI muestra "precio a definir", no una pérdida real).
 *
 * Montos en centavos (BigInt), nunca float ni pesos.
 */

export interface EventProfitInput {
  /** Precio pactado con el cliente, en centavos. null = todavía sin definir. */
  agreedCents: bigint | null
  /** Σ de los gastos (Expense) imputados a este evento, en centavos. */
  costCents: bigint
}

export interface EventProfit {
  /** false si no hay precio pactado (agreedCents era null). */
  hasPrice: boolean
  /** Ingreso considerado para la ganancia = pactado (0 si no hay precio). */
  incomeCents: bigint
  costCents: bigint
  /** income − cost. Puede ser negativo (pérdida). */
  profitCents: bigint
  /** ganancia/ingreso × 100, a 2 decimales. null si income = 0 (no dividir por 0). */
  marginPct: number | null
}

export function computeEventProfit(input: EventProfitInput): EventProfit {
  const hasPrice = input.agreedCents !== null
  const incomeCents = input.agreedCents ?? 0n
  const costCents = input.costCents
  const profitCents = incomeCents - costCents
  const marginPct = incomeCents === 0n ? null : Math.round((Number(profitCents) / Number(incomeCents)) * 10000) / 100
  return { hasPrice, incomeCents, costCents, profitCents, marginPct }
}
