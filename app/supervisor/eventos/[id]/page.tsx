import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { getEvent, canSupervisorAccessEvent } from '@/lib/events/events'
import { EVENT_STATUS_LABELS, ASSIGNMENT_STATUS_LABELS, type AssignmentStatus } from '@/lib/events/schema'
import { instantToBaLocal, baTimeLabel, baDayLabel, workDateKeyOf } from '@/lib/events/time'
import { StatusBadge, eventTone, assignmentTone } from '@/components/events/status-badge'
import { SupervisorAssignmentControls } from '@/components/events/supervisor-assignment-controls'
import { SupervisorFichajePanel, type Member } from '@/components/timeentry/supervisor-fichaje-panel'

export default async function SupervisorEventoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireRole(['SUPERVISOR'])
  const employeeId = session.employee?.id

  // Un supervisor NO accede a un evento donde no es supervisor.
  if (!employeeId || !(await canSupervisorAccessEvent(prisma, employeeId, id))) notFound()

  const event = await getEvent(prisma, id)
  if (!event) notFound()

  // Personal del evento (empleados distintos) + estado de fichada abierta.
  const memberIds = [...new Set(event.assignments.map((a) => a.employeeId))]
  const openEntries = await prisma.timeEntry.findMany({
    where: { employeeId: { in: memberIds }, checkOut: null, deletedAt: null },
    select: { employeeId: true },
  })
  const openSet = new Set(openEntries.map((e) => e.employeeId))
  const seen = new Set<string>()
  const members: Member[] = []
  for (const a of event.assignments) {
    if (seen.has(a.employeeId)) continue
    seen.add(a.employeeId)
    members.push({
      employeeId: a.employeeId,
      name: `${a.employee.lastName}, ${a.employee.firstName}`,
      isOpen: openSet.has(a.employeeId),
    })
  }

  return (
    <div>
      <header className="mb-6 border-b pb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{event.name}</h1>
          <StatusBadge label={EVENT_STATUS_LABELS[event.status]} tone={eventTone(event.status)} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {instantToBaLocal(event.startAt).replace('T', ' ')} → {instantToBaLocal(event.endAt).replace('T', ' ')}
        </p>
      </header>

      <h2 className="mb-3 text-sm font-semibold">Asignaciones</h2>
      <ul className="divide-y rounded-lg border">
        {event.assignments.map((a) => {
          const mine = a.employeeId === employeeId
          return (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {a.employee.lastName}, {a.employee.firstName}
                  </span>
                  {a.isSupervisor && <StatusBadge label="Supervisor" tone="accent" />}
                  {mine && <span className="text-xs text-primary">(vos)</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {a.role} · {baTimeLabel(a.startAt)}–{baTimeLabel(a.endAt)} · imputa al{' '}
                  {baDayLabel(workDateKeyOf(a.startAt))}
                </div>
              </div>
              {mine ? (
                <SupervisorAssignmentControls assignmentId={a.id} eventId={event.id} status={a.status} />
              ) : (
                <StatusBadge
                  label={ASSIGNMENT_STATUS_LABELS[a.status as AssignmentStatus]}
                  tone={assignmentTone(a.status)}
                />
              )}
            </li>
          )
        })}
      </ul>

      <div className="mt-8">
        <SupervisorFichajePanel eventId={event.id} members={members} />
      </div>
    </div>
  )
}
