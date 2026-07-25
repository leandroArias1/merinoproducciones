import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { prisma } from '@/lib/db'
import { getEvent } from '@/lib/events/events'
import { EVENT_STATUS_LABELS, type EventStatus } from '@/lib/events/schema'
import { instantToBaLocal, baTimeLabel, baDayLabel, workDateKeyOf } from '@/lib/events/time'
import { Button } from '@/components/ui/button'
import { StatusBadge, eventTone } from '@/components/events/status-badge'
import { EventStatusControls } from '@/components/events/event-status-controls'
import { AssignmentsPanel, type AssignmentRow } from '@/components/events/assignments-panel'
import { EventMoneyPanel } from '@/components/events/event-money-panel'
import { buildEventProfit } from '@/lib/finance/profit'
import { listParties } from '@/lib/finance/party'

export default async function EventoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [event, employees, fin, clients] = await Promise.all([
    getEvent(prisma, id),
    prisma.employee.findMany({
      where: { deletedAt: null, active: true },
      orderBy: [{ lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true },
    }),
    // Los números de plata salen de la misma función pura que la pantalla de
    // rentabilidad: acá no se recalcula nada distinto.
    buildEventProfit(prisma, id),
    listParties(prisma, 'CLIENT'),
  ])
  if (!event) notFound()

  const clientName = clients.find((c) => c.id === event.clientId)?.name ?? null

  const rows: AssignmentRow[] = event.assignments.map((a) => ({
    id: a.id,
    employeeName: `${a.employee.lastName}, ${a.employee.firstName}`,
    role: a.role ?? '',
    isSupervisor: a.isSupervisor,
    status: a.status,
    startLabel: baTimeLabel(a.startAt),
    endLabel: baTimeLabel(a.endAt),
    workDateLabel: baDayLabel(workDateKeyOf(a.startAt)),
  }))

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">{event.name}</h1>
            <StatusBadge label={EVENT_STATUS_LABELS[event.status]} tone={eventTone(event.status)} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {/* Manda el cliente de la agenda; el texto libre viejo queda como
                respaldo para los eventos cargados antes de unificar. */}
            {[clientName ?? event.client, event.venue].filter(Boolean).join(' · ') || 'Sin cliente ni lugar'}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {instantToBaLocal(event.startAt).replace('T', ' ')} → {instantToBaLocal(event.endAt).replace('T', ' ')}
          </p>
        </div>
        <Link href={`/admin/eventos/${event.id}/editar`}>
          <Button variant="secondary" size="sm">
            <Pencil /> Editar
          </Button>
        </Link>
      </header>

      <div className="mb-6">
        <EventStatusControls id={event.id} status={event.status as EventStatus} />
      </div>

      {fin && (
        <div className="mb-8">
          <EventMoneyPanel fin={fin} clients={clients} clientName={clientName} />
        </div>
      )}

      <AssignmentsPanel
        eventId={event.id}
        employees={employees.map((e) => ({ id: e.id, name: `${e.lastName}, ${e.firstName}` }))}
        assignments={rows}
      />
    </div>
  )
}
