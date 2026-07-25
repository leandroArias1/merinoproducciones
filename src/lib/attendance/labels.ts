/**
 * Textos legibles (castellano) de los enums de asistencia. ÚNICO lugar: la UI
 * nunca muestra el código crudo del enum (era un pulido pendiente del QA).
 */

export const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  PRESENT: 'Presente',
  ABSENT: 'Ausente',
  LATE: 'Tarde',
  JUSTIFIED: 'Justificado',
  ON_LEAVE: 'Licencia',
  HOLIDAY: 'Feriado',
  INCOMPLETE: 'Incompleto',
  UNVERIFIED: 'Sin verificar',
}

/** Warnings del motor (src/lib/domain/attendance.ts) + del caller (persist.ts). */
export const ATTENDANCE_WARNING_LABELS: Record<string, string> = {
  FICHADA_ABIERTA: 'Fichada abierta (no cerró)',
  FICHADAS_SOLAPADAS: 'Fichadas solapadas',
  SIN_FICHADA_CONFIRMADO_POR_SUPERVISOR: 'Sin fichada, confirmado por supervisor',
  LICENCIA_SOLAPA_ASIGNACION: 'Licencia solapa una asignación',
  TRABAJO_SIN_TURNO: 'Trabajo sin turno',
  TRABAJO_EN_FERIADO: 'Trabajo en feriado',
  TRABAJO_EN_LICENCIA: 'Trabajo durante una licencia',
  JORNADA_CORTA: 'Jornada más corta que lo esperado',
  MANUAL_SIN_EXPECTATIVA: 'Ajuste manual sin turno esperado',
}

export function statusLabel(status: string | null): string {
  return status ? (ATTENDANCE_STATUS_LABELS[status] ?? status) : '—'
}

export function warningLabel(code: string): string {
  return ATTENDANCE_WARNING_LABELS[code] ?? code
}

export function statusTone(s: string | null): 'success' | 'danger' | 'muted' {
  if (s === 'PRESENT') return 'success'
  if (s === 'UNVERIFIED' || s === 'INCOMPLETE' || s === 'ABSENT') return 'danger'
  return 'muted'
}
