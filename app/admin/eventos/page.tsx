import Link from 'next/link'
import { DateTime } from 'luxon'
import { Plus } from 'lucide-react'
import { prisma } from '@/lib/db'
import { listEvents } from '@/lib/events/events'
import { EVENT_STATUSES, EVENT_STATUS_LABELS, type EventStatus } from '@/lib/events/schema'
import { BA_ZONE } from '@/lib/attendance/timezone'
import { instantToBaLocal } from '@/lib/events/time'
import { Button } from '@/components/ui/button'
import { StatusBadge, eventTone } from '@/components/events/status-badge'
import { MonthCalendar } from '@/components/events/month-calendar'
import { cn } from '@/lib/utils'
import { FilterForm } from '@/components/shell/filter-form'

function ViewTab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm transition-colors',
        active ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:bg-secondary',
      )}
    >
      {children}
    </Link>
  )
}

export default async function EventosPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; estado?: string; mes?: string }>
}) {
  const sp = await searchParams
  const vista = sp.vista === 'calendario' ? 'calendario' : 'lista'
  const estado = EVENT_STATUSES.includes(sp.estado as EventStatus) ? (sp.estado as EventStatus) : undefined

  const events = await listEvents(prisma, estado ? { status: estado } : undefined)

  const monthKey = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : DateTime.now().setZone(BA_ZONE).toFormat('yyyy-MM')
  const prevMonth = DateTime.fromISO(`${monthKey}-01`, { zone: BA_ZONE }).minus({ months: 1 }).toFormat('yyyy-MM')
  const nextMonth = DateTime.fromISO(`${monthKey}-01`, { zone: BA_ZONE }).plus({ months: 1 }).toFormat('yyyy-MM')

  return (
    <div>
      <header className="mb-6 flex items-end justify-between border-b pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Eventos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Producciones y sus asignaciones.</p>
        </div>
        <Link href="/admin/eventos/nuevo">
          <Button>
            <Plus /> Nuevo evento
          </Button>
        </Link>
      </header>

      <div className="mb-4 flex items-center gap-1">
        <ViewTab href="/admin/eventos?vista=lista" active={vista === 'lista'}>
          Lista
        </ViewTab>
        <ViewTab href="/admin/eventos?vista=calendario" active={vista === 'calendario'}>
          Calendario
        </ViewTab>
      </div>

      {vista === 'calendario' ? (
        <div>
          <div className="mb-3 flex items-center gap-3">
            <Link
              href={`/admin/eventos?vista=calendario&mes=${prevMonth}`}
              className="rounded-md border px-2.5 py-1 text-sm hover:bg-secondary"
            >
              ←
            </Link>
            <span className="text-sm font-medium capitalize">
              {DateTime.fromISO(`${monthKey}-01`, { zone: BA_ZONE }).setLocale('es').toFormat('LLLL yyyy')}
            </span>
            <Link
              href={`/admin/eventos?vista=calendario&mes=${nextMonth}`}
              className="rounded-md border px-2.5 py-1 text-sm hover:bg-secondary"
            >
              →
            </Link>
          </div>
          <MonthCalendar monthKey={monthKey} events={events} />
        </div>
      ) : (
        <>
          <FilterForm className="mb-4 flex flex-wrap items-end gap-3">
            <input type="hidden" name="vista" value="lista" />
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Estado</label>
              <select
                name="estado"
                defaultValue={estado ?? ''}
                className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-primary"
              >
                <option value="">Todos</option>
                {EVENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {EVENT_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="secondary" size="sm">
              Filtrar
            </Button>
          </FilterForm>

          {events.length === 0 ? (
            <div className="grid place-items-center rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
              No hay eventos con ese filtro.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Evento</th>
                    <th className="px-4 py-2.5 font-medium">Inicio</th>
                    <th className="px-4 py-2.5 font-medium">Asignaciones</th>
                    <th className="px-4 py-2.5 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {events.map((e) => (
                    <tr key={e.id} className="transition-colors hover:bg-secondary/60">
                      <td className="px-4 py-2.5">
                        <Link href={`/admin/eventos/${e.id}`} className="font-medium hover:text-primary">
                          {e.name}
                        </Link>
                        {e.client && <div className="text-xs text-muted-foreground">{e.client}</div>}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                        {instantToBaLocal(e.startAt).replace('T', ' ')}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{e._count.assignments}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge label={EVENT_STATUS_LABELS[e.status]} tone={eventTone(e.status)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
