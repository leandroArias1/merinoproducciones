import { formatPesos, monthLabel } from '@/lib/payroll/format'

/**
 * Formato de PRESENTACIÓN (fase 0 del rediseño). Vive fuera de `src/lib` a
 * propósito: `src/lib` es dominio y tiene tests; esto es sólo cómo se ve.
 *
 * OJO CON LA ZONA — es la trampa que ya nos mordió dos veces:
 *
 * · Los días de negocio (`workDate`, `effectiveFrom`, `incurredOn`…) son
 *   columnas `@db.Date` y Prisma las devuelve a MEDIANOCHE UTC. Formatearlas
 *   con la zona local las corre un día para atrás (medianoche UTC = 21:00 del
 *   día anterior en Buenos Aires). Por eso `fechaAR` lee las partes en UTC.
 *
 * · Los INSTANTES reales (fichadas, `createdAt`) sí van en hora de Buenos
 *   Aires, y para eso ya existen `baTimeLabel` / `dateKey` en el dominio.
 *   No los reimplementamos acá.
 */

/** Día de negocio (`@db.Date`) → "28/07/2026". Lee en UTC, no corre el día. */
export function fechaAR(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, '0')
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${d}/${m}/${date.getUTCFullYear()}`
}

/** Día de negocio → "28/07/26", para columnas angostas. */
export function fechaCortaAR(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, '0')
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${d}/${m}/${String(date.getUTCFullYear()).slice(2)}`
}

/** Clave 'YYYY-MM-DD' → "28/07/2026". Para lo que ya viaja como string. */
export function fechaARDesdeClave(key: string): string {
  const [y, m, d] = key.split('-')
  return `${d}/${m}/${y}`
}

/** Día de negocio → "martes 28 de julio". Para encabezados, no para tablas. */
export function fechaLargaAR(date: Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC', // el día ya está resuelto: no re-interpretar en local
  }).format(date)
}

/** Cantidad entera con separador de miles: 1.100.000. */
export function numeroAR(n: number): string {
  return new Intl.NumberFormat('es-AR').format(n)
}

// Reexportados para que las pantallas tengan UN solo lugar de importación de
// formato. La implementación de plata (centavos → pesos) sigue en el dominio.
export { formatPesos, monthLabel }
