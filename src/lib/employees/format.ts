import { DAY_LABELS } from './schema'

/** Minutos desde 00:00 → "HH:MM". */
export function minutesToHHMM(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** "HH:MM" → minutos desde 00:00. */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Resumen legible de la plantilla: "Lun–Vie 09:00–17:00" cuando aplica. */
export function summarizeDays(days: { dayOfWeek: number; startMinute: number; endMinute: number }[]): string {
  if (days.length === 0) return 'Sin días'
  return days
    .slice()
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    .map((d) => `${DAY_LABELS[d.dayOfWeek].slice(0, 3)} ${minutesToHHMM(d.startMinute)}–${minutesToHHMM(d.endMinute)}`)
    .join(' · ')
}
