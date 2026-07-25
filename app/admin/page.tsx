import Link from 'next/link'
import { AlertTriangle, Users, CalendarDays } from 'lucide-react'
import { prisma } from '@/lib/db'
import { reviewCount } from '@/lib/attendance/view'

export default async function DashboardPage() {
  const [revisar, empleados, eventos] = await Promise.all([
    reviewCount(prisma),
    prisma.employee.count({ where: { deletedAt: null, active: true } }),
    prisma.event.count({ where: { deletedAt: null, status: { in: ['CONFIRMED', 'IN_PROGRESS'] } } }),
  ])

  return (
    <div>
      <header className="mb-6 border-b pb-4">
        <h1 className="text-xl font-semibold tracking-tight">Hoy</h1>
        <p className="mt-1 text-sm text-muted-foreground">Lo que hay que resolver hoy.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {/* La más importante: lo que traba la liquidación. */}
        <Link
          href="/admin/asistencia?vista=revisar"
          className={
            'rounded-lg border p-5 transition-colors ' +
            (revisar > 0
              ? 'border-[var(--warning)]/40 hover:bg-[color-mix(in_oklch,var(--warning)_6%,transparent)]'
              : 'hover:bg-secondary')
          }
        >
          <div className="flex items-center gap-2 text-sm text-muted-foreground [&_svg]:size-4">
            <AlertTriangle className={revisar > 0 ? 'text-[var(--warning)]' : ''} />
            Días a revisar
          </div>
          <div className={'mt-2 text-3xl font-bold tabular-nums ' + (revisar > 0 ? 'text-[var(--warning)]' : '')}>
            {revisar}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Sin verificar, incompletos o con avisos.</p>
        </Link>

        <Link href="/admin/empleados" className="rounded-lg border p-5 transition-colors hover:bg-secondary">
          <div className="flex items-center gap-2 text-sm text-muted-foreground [&_svg]:size-4">
            <Users /> Empleados activos
          </div>
          <div className="mt-2 text-3xl font-bold tabular-nums">{empleados}</div>
        </Link>

        <Link href="/admin/eventos" className="rounded-lg border p-5 transition-colors hover:bg-secondary">
          <div className="flex items-center gap-2 text-sm text-muted-foreground [&_svg]:size-4">
            <CalendarDays /> Eventos en curso
          </div>
          <div className="mt-2 text-3xl font-bold tabular-nums">{eventos}</div>
        </Link>
      </div>
    </div>
  )
}
