import { DateTime } from 'luxon'
import { BA_ZONE, workDateFromKey } from '@/lib/attendance/timezone'

/**
 * Conversión entre el input `datetime-local` (hora local Buenos Aires, naive) y
 * el instante UTC que se guarda. TODO pasa por luxon con la zona BA — nunca se
 * restan horas a mano.
 */

/** "YYYY-MM-DDTHH:mm" (hora BA) → instante UTC. */
export function baLocalToInstant(local: string): Date {
  return DateTime.fromISO(local, { zone: BA_ZONE }).toJSDate()
}

/** Instante UTC → "YYYY-MM-DDTHH:mm" en BA (para poblar un datetime-local). */
export function instantToBaLocal(d: Date): string {
  return DateTime.fromJSDate(d, { zone: BA_ZONE }).toFormat("yyyy-MM-dd'T'HH:mm")
}

/** Clave 'YYYY-MM-DD' del día de negocio (fecha BA del instante de INICIO). */
export function workDateKeyOf(instant: Date): string {
  return DateTime.fromJSDate(instant, { zone: BA_ZONE }).toISODate() as string
}

/** workDate como @db.Date (medianoche UTC) del instante de inicio. */
export function workDateOf(instant: Date): Date {
  return workDateFromKey(workDateKeyOf(instant))
}

/** Etiqueta legible: "jueves 14 de agosto". */
export function baDayLabel(key: string): string {
  return DateTime.fromISO(key, { zone: BA_ZONE }).setLocale('es').toFormat("cccc d 'de' LLLL")
}

/** Etiqueta corta de hora: "20:00". */
export function baTimeLabel(instant: Date): string {
  return DateTime.fromJSDate(instant, { zone: BA_ZONE }).toFormat('HH:mm')
}
