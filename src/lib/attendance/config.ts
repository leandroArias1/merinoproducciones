/**
 * Configuración del barrido de asistencia (capa de caller, NO del motor puro).
 */
export const SWEEP_DEFAULTS = {
  /**
   * Ventana MÓVIL por defecto: cuántos días hacia atrás recalcula el cron.
   * No es "ayer": un día UNVERIFIED se resuelve después (el supervisor marca
   * la asignación COMPLETED dos días más tarde). Si solo procesáramos el día
   * anterior, ese día quedaría UNVERIFIED para siempre y trabaría payroll.
   * Idealmente coincide con el período de liquidación abierto.
   */
  windowDays: 45,
  /**
   * Escrituras por transacción. Vercel tiene timeout de función, así que el
   * barrido no aplica todo en una sola transacción gigante.
   *
   * Default alto (100) para callers en Postgres local/rápido (tests, seeds).
   */
  chunkSize: 100,
  /**
   * Chunk EFECTIVO del cron en producción (pooler de Supabase, ~500ms/op).
   * Chico A PROPÓSITO: cada transacción hace pocos statements y entra muy por
   * debajo del timeout interactivo de Prisma (5s default, acá subido a 20s).
   * Era el bug #1: con 100, una sola transacción de ~200 statements sobre el
   * pooler superaba los 5s y el cron devolvía 500. Ver route.ts y sweep.ts.
   */
  cronChunkSize: 5,
  /**
   * Timeout (ms) de cada transacción de chunk. Cinturón por si un chunk tarda
   * más de lo esperado sobre el pooler; muy por encima del default de 5s.
   */
  txTimeoutMs: 20_000,
} as const
