/** Centavos (BigInt) → pesos formateados ($750.000). NUNCA se muestra el BigInt
 *  crudo ni centavos. Se usa server-side; al cruzar a un client component se pasa
 *  ya formateado (string), nunca el BigInt (regla de serialización de CLAUDE.md). */
export function formatPesos(cents: bigint | number): string {
  const pesos = Number(cents) / 100
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(pesos)
}

const MESES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function monthLabel(year: number, month: number): string {
  return `${MESES[month] ?? month} ${year}`
}
