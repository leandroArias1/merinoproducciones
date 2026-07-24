import Link from 'next/link'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { listEventsForSupervisor } from '@/lib/events/events'
import { EVENT_STATUS_LABELS } from '@/lib/events/schema'
import { instantToBaLocal } from '@/lib/events/time'
import { StatusBadge, eventTone } from '@/components/events/status-badge'

export default async function SupervisorEventosPage() {
  const session = await requireRole(['SUPERVISOR'])
  const employeeId = session.employee?.id
  const events = employeeId ? await listEventsForSupervisor(prisma, employeeId) : []

  return (
    <div>
      <header className="mb-6 border-b pb-4">
        <h1 className="text-xl font-semibold tracking-tight">Mis eventos</h1>
        <p className="mt-1 text-sm text-muted-foreground">Eventos donde sos supervisor.</p>
      </header>

      {!employeeId ? (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Tu usuario no está vinculado a un legajo.
        </p>
      ) : events.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          No tenés eventos asignados como supervisor.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {events.map((e) => (
            <li key={e.id}>
              <Link href={`/supervisor/eventos/${e.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-secondary/60">
                <div className="min-w-0">
                  <div className="font-medium">{e.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {[e.venue, instantToBaLocal(e.startAt).replace('T', ' ')].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <StatusBadge label={EVENT_STATUS_LABELS[e.status]} tone={eventTone(e.status)} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
