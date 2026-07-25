/**
 * Motor de LIQUIDACIÓN — FUNCIÓN PURA por (empleado, período mensual).
 *
 * Sin Prisma, sin I/O, sin Date.now(): recibe datos planos ya resueltos por el
 * caller (sueldo vigente segmentado, días activos, cantidad de ABSENT, valor del
 * descuento) y devuelve el recibo del mes. Misma arquitectura que el motor de
 * asistencia (src/lib/domain/attendance.ts).
 *
 * Reglas (Fase 2, confirmadas):
 *  - Sueldo mensual FIJO por categoría (750k L-V / 500k L-M), versionado por
 *    empleado en SalaryHistory. Acá llega como uno o más TRAMOS ya resueltos.
 *  - Descuento de 30k por cada día ABSENT del mes. JUSTIFIED/ON_LEAVE/HOLIDAY
 *    NO descuentan (el caller ya cuenta solo los ABSENT).
 *  - Ingreso/baja a mitad de mes: base PROPORCIONAL a los días CALENDARIO
 *    empleados (activeDays / daysInMonth). Cambio de categoría a mitad de mes:
 *    un tramo por versión de sueldo, cada uno prorrateado por SUS días.
 *  - Neto = max(0, base − descuentos). El piso a 0 es defensivo: con los topes
 *    reales de faltas nunca se alcanza (22×30k<750k, 13×30k<500k).
 *  - Si el mes tiene días UNVERIFIED/INCOMPLETE sin resolver, el ítem está
 *    BLOQUEADO y no se calcula recibo (lo decide el caller, se pasa `blocked`).
 *
 * Montos SIEMPRE en centavos (BigInt), nunca float ni pesos.
 */

/** Un tramo de sueldo dentro de la ventana activa del empleado en el mes. */
export interface SalarySegment {
  /** Etiqueta para el recibo (nombre de categoría / descripción del tramo). */
  label: string
  /** Sueldo mensual de este tramo, en centavos. */
  monthlyCents: bigint
  /** Días CALENDARIO del mes en que este tramo aplica Y el empleado estuvo empleado. */
  activeDays: number
}

export interface PayrollInput {
  /** Días calendario del mes (28..31). */
  daysInMonth: number
  /** Tramos de sueldo dentro de la ventana activa. Vacío = sin actividad liquidable. */
  segments: SalarySegment[]
  /** Cantidad de días ABSENT del período (el caller cuenta solo los ABSENT dentro de la ventana). */
  absentDays: number
  /** Valor del descuento por falta, en centavos (config vigente). */
  deductionPerAbsentCents: bigint
  /** true si el mes tiene días UNVERIFIED/INCOMPLETE sin resolver. */
  blocked: boolean
}

export type PayrollLineKind = 'BASE' | 'DEDUCTION' | 'ADJUSTMENT'

export interface PayrollLine {
  kind: PayrollLineKind
  concept: string
  /** Con signo: BASE/ADJUSTMENT suman, DEDUCTION resta. La suma de las líneas == netCents. */
  amountCents: bigint
}

export type PayrollResult =
  | { status: 'BLOCKED' }
  | {
      status: 'OK'
      baseCents: bigint
      deductionCents: bigint
      netCents: bigint
      absentDays: number
      /** true si el descuento superaba al base y el neto se floreó a 0 (defensivo). */
      flooredToZero: boolean
      lines: PayrollLine[]
    }

/** Proporción a centavo, redondeo al más cercano (half-up). Mes completo => sin proración. */
function prorate(monthlyCents: bigint, activeDays: number, daysInMonth: number): bigint {
  if (activeDays >= daysInMonth) return monthlyCents
  if (activeDays <= 0) return 0n
  const num = monthlyCents * BigInt(activeDays)
  const den = BigInt(daysInMonth)
  return (num + den / 2n) / den
}

export function computePayrollItem(input: PayrollInput): PayrollResult {
  if (input.blocked) return { status: 'BLOCKED' }

  const lines: PayrollLine[] = []
  let baseCents = 0n

  for (const seg of input.segments) {
    const amount = prorate(seg.monthlyCents, seg.activeDays, input.daysInMonth)
    baseCents += amount
    const prorated = seg.activeDays < input.daysInMonth
    lines.push({
      kind: 'BASE',
      concept: prorated
        ? `Sueldo base ${seg.label} — proporcional ${seg.activeDays}/${input.daysInMonth} días`
        : `Sueldo base ${seg.label}`,
      amountCents: amount,
    })
  }

  const deductionCents = input.deductionPerAbsentCents * BigInt(input.absentDays)
  if (input.absentDays > 0) {
    lines.push({
      kind: 'DEDUCTION',
      concept: `Faltas (${input.absentDays})`,
      amountCents: -deductionCents,
    })
  }

  const rawNet = baseCents - deductionCents
  const flooredToZero = rawNet < 0n
  const netCents = flooredToZero ? 0n : rawNet

  // Si se floorea, una línea de ajuste deja la suma de líneas == netCents (0).
  if (flooredToZero) {
    lines.push({
      kind: 'ADJUSTMENT',
      concept: 'Piso a cero (el descuento supera el sueldo)',
      amountCents: deductionCents - baseCents,
    })
  }

  return { status: 'OK', baseCents, deductionCents, netCents, absentDays: input.absentDays, flooredToZero, lines }
}
