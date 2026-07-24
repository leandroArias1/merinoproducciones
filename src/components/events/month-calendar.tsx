import Link from 'next/link'
import { DateTime } from 'luxon'
import { BA_ZONE } from '@/lib/attendance/timezone'
import { workDateKeyOf } from '@/lib/events/time'
import { eventTone } from './status-badge'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const CHIP_TONE: Record<string, string> = {
  accent: 'bg-primary/10 text-primary',
  success: 'bg-[color-mix(in_oklch,var(--success)_12%,transparent)] text-[var(--success)]',
  danger: 'bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)] text-destructive line-through',
  neutral: 'bg-secondary text-foreground',
  muted: 'bg-secondary text-muted-foreground',
}

export function MonthCalendar({
  monthKey,
  events,
}: {
  monthKey: string // 'YYYY-MM'
  events: { id: string; name: string; status: string; startAt: Date }[]
}) {
  const first = DateTime.fromISO(`${monthKey}-01`, { zone: BA_ZONE })
  const daysInMonth = first.daysInMonth as number
  const lead = first.weekday % 7 // luxon: 1=lun..7=dom -> 0=dom
  const byDay = new Map<number, typeof events>()
  for (const e of events) {
    const key = workDateKeyOf(e.startAt)
    if (!key.startsWith(monthKey)) continue
    const day = Number(key.slice(8, 10))
    const arr = byDay.get(day) ?? []
    arr.push(e)
    byDay.set(day, arr)
  }

  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="grid grid-cols-7 border-b bg-secondary text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => (
          <div key={i} className={cn('min-h-24 border-b border-r p-1.5', (i + 1) % 7 === 0 && 'border-r-0')}>
            {day && (
              <>
                <div className="mb-1 text-xs text-muted-foreground">{day}</div>
                <div className="space-y-1">
                  {(byDay.get(day) ?? []).map((e) => (
                    <Link
                      key={e.id}
                      href={`/admin/eventos/${e.id}`}
                      className={cn('block truncate rounded px-1.5 py-0.5 text-xs', CHIP_TONE[eventTone(e.status)])}
                      title={e.name}
                    >
                      {e.name}
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
