/**
 * Configuración del motor de asistencia.
 *
 * ÚNICO lugar donde vive el número de tolerancia de tardanza. Hoy es una
 * constante; cuando el admin lo haga configurable, se carga de la DB y se
 * pasa a `resolveAttendance` como `config` — el motor no cambia ni una línea.
 * Por eso la función pura lo RECIBE por parámetro y nunca lee este global.
 */
export interface AttendanceConfig {
  /**
   * Minutos de gracia antes de marcar LATE. Se evalúa POR intervalo esperado
   * (contra el start de cada turno/horario, no contra el primero del día).
   * También es el margen bajo el cual una jornada más corta que lo esperado
   * NO se marca como JORNADA_CORTA.
   */
  lateToleranceMinutes: number
}

export const DEFAULT_ATTENDANCE_CONFIG: AttendanceConfig = {
  lateToleranceMinutes: 10,
}
