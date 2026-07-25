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
   * Chunk EFECTIVO del cron en producción. Con `executePlanBatch` las ALTAS del
   * lote se insertan con createMany (2 statements por lote), así que un lote más
   * grande sigue siendo barato en el caso dominante (backfill = casi todo altas).
   * Se acota a 25 para que el PEOR caso —un lote de 25 update/delete por fila,
   * ~50 statements ≈ 7s sobre el pooler a 145ms/statement— quede bien bajo el
   * timeout de 20s. Antes era 5 (con el path fila-por-fila, pre-createMany).
   * Medición prod que motivó todo esto: 109 altas fila-por-fila = 33s.
   */
  cronChunkSize: 25,
  /**
   * Timeout (ms) de cada transacción de chunk. Cinturón por si un chunk tarda
   * más de lo esperado sobre el pooler; muy por encima del default de 5s.
   */
  txTimeoutMs: 20_000,
} as const
