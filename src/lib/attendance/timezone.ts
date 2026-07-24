import { DateTime } from 'luxon'

/**
 * Resolución de zona horaria del caller de asistencia.
 *
 * TODO se hace con luxon sobre America/Argentina/Buenos_Aires. NUNCA se resta
 * 3 horas a mano: hoy Argentina no tiene DST, pero lo tuvo (2007-2009) y si
 * volviera el hardcodeo guardaría instantes corridos en silencio. luxon aplica
 * el DST histórico correcto vía la base IANA.
 */

export const BA_ZONE = 'America/Argentina/Buenos_Aires'

/** 'YYYY-MM-DD' de un workDate (columna @db.Date, que Prisma devuelve a medianoche UTC). */
export function dateKey(workDate: Date): string {
  return workDate.toISOString().slice(0, 10)
}

/** Date @db.Date (medianoche UTC) desde una clave 'YYYY-MM-DD'. */
export function workDateFromKey(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`)
}

/** dayOfWeek 0=domingo..6=sábado del día (convención del schema). */
export function dowBA(key: string): number {
  // luxon: weekday 1=lunes..7=domingo. %7 -> 0=domingo..6=sábado.
  return DateTime.fromISO(key, { zone: BA_ZONE }).weekday % 7
}

/** Lista inclusiva de claves 'YYYY-MM-DD' (BA) entre from y to. */
export function listDateKeys(fromKey: string, toKey: string): string[] {
  const out: string[] = []
  let cur = DateTime.fromISO(fromKey, { zone: BA_ZONE }).startOf('day')
  const end = DateTime.fromISO(toKey, { zone: BA_ZONE }).startOf('day')
  while (cur <= end) {
    out.push(cur.toISODate() as string)
    cur = cur.plus({ days: 1 })
  }
  return out
}

/**
 * Resuelve un tramo de horario habitual (minutos desde medianoche local) a
 * instantes concretos para un día, respetando la zona BA y su DST histórico.
 * endMinute <= startMinute => el turno cruza medianoche (termina al día sig.).
 */
export function resolveScheduleInterval(
  key: string,
  startMinute: number,
  endMinute: number,
): { start: Date; end: Date } {
  const base = DateTime.fromISO(key, { zone: BA_ZONE }).startOf('day')
  const endMin = endMinute <= startMinute ? endMinute + 1440 : endMinute
  return {
    start: base.plus({ minutes: startMinute }).toJSDate(),
    end: base.plus({ minutes: endMin }).toJSDate(),
  }
}

/** Clave 'YYYY-MM-DD' (BA) de "hoy" respecto de un instante de referencia. */
export function todayKeyBA(reference: Date): string {
  return DateTime.fromJSDate(reference, { zone: BA_ZONE }).toISODate() as string
}

/** Clave N días antes de otra (en calendario BA). */
export function shiftKey(key: string, days: number): string {
  return DateTime.fromISO(key, { zone: BA_ZONE }).plus({ days }).toISODate() as string
}
