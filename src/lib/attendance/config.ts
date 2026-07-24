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
   */
  chunkSize: 100,
} as const
