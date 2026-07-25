import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { todayStateFor } from '@/lib/timeentry/fichaje'
import { workDateOf, workDateKeyOf, baTimeLabel } from '@/lib/events/time'
import { dateKey, dowBA } from '@/lib/attendance/timezone'
import { minutesToHHMM } from '@/lib/employees/format'
import { FicharButton } from '@/components/timeentry/fichar-button'
import { LogoutButton } from '@/components/shell/logout-button'

async function todayWork(employeeId: string, now: Date): Promise<string> {
  const workDate = workDateOf(now)
  const asg = await prisma.eventAssignment.findFirst({
    where: { employeeId, workDate, deletedAt: null, status: { not: 'CANCELLED' } },
    orderBy: { startAt: 'asc' },
    select: { role: true, startAt: true, endAt: true, event: { select: { name: true } } },
  })
  if (asg) {
    return `${asg.event.name} · ${asg.role ?? ''} ${baTimeLabel(asg.startAt)}–${baTimeLabel(asg.endAt)}`
  }
  const dow = dowBA(workDateKeyOf(now))
  const sched = await prisma.workSchedule.findFirst({
    where: { employeeId, dayOfWeek: dow, deletedAt: null, effectiveTo: null, effectiveFrom: { lte: workDate } },
    orderBy: { startMinute: 'asc' },
    select: { startMinute: true, endMinute: true },
  })
  if (sched) return `Horario ${minutesToHHMM(sched.startMinute)}–${minutesToHHMM(sched.endMinute)}`
  return 'Sin asignación'
}

export default async function EmpleadoPage() {
  const session = await requireRole(['EMPLOYEE'])
  const employeeId = session.employee?.id
  const nombre = session.employee?.firstName ?? session.user.name ?? session.user.email
  const now = new Date()

  const [state, work] = employeeId
    ? await Promise.all([todayStateFor(prisma, employeeId, now), todayWork(employeeId, now)])
    : [null, 'Sin legajo']

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 pb-8 pt-6">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold tracking-tight">
          Merino <span className="text-primary">Producciones</span>
        </span>
        <LogoutButton />
      </div>

      <div className="mt-10">
        <p className="text-sm text-muted-foreground">Hola,</p>
        <h1 className="text-4xl font-bold tracking-tight">{nombre}</h1>
      </div>

      <div className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tu trabajo de hoy</p>
        <p className="mt-2 text-2xl font-semibold">{work}</p>
      </div>

      {state && state.entries.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fichadas de hoy</p>
          <ul className="mt-2 space-y-1">
            {state.entries.map((e) => (
              <li key={e.id} className="flex items-center gap-2 text-lg tabular-nums">
                <span className="font-semibold">{baTimeLabel(e.checkIn)}</span>
                <span className="text-muted-foreground">→</span>
                <span className={e.checkOut ? 'font-semibold' : 'text-primary'}>
                  {e.checkOut ? baTimeLabel(e.checkOut) : 'abierta'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-auto pt-10">
        {employeeId ? (
          <FicharButton nextAction={state!.nextAction} />
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            Tu usuario no está vinculado a un legajo. Avisá a un administrador.
          </p>
        )}
      </div>
    </main>
  )
}
