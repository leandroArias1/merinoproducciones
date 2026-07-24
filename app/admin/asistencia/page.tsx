import Link from 'next/link'
import { DateTime } from 'luxon'
import { AlertTriangle } from 'lucide-react'
import { prisma } from '@/lib/db'
import { dailyAttendance, reviewList } from '@/lib/attendance/view'
import { workDateFromKey, BA_ZONE } from '@/lib/attendance/timezone'
import { baTimeLabel, instantToBaLocal } from '@/lib/events/time'
import { minutesToHHMM } from '@/lib/employees/format'
import { StatusBadge } from '@/components/events/status-badge'
import { DayCorrections } from '@/components/attendance/day-corrections'
import { cn } from '@/lib/utils'

const STATUS_LABELS: Record<string, string> = {
  PRESENT: 'Presente',
  ABSENT: 'Ausente',
  LATE: 'Tarde',
  JUSTIFIED: 'Justificado',
  ON_LEAVE: 'Licencia',
  HOLIDAY: 'Feriado',
  INCOMPLETE: 'Incompleto',
  UNVERIFIED: 'Sin verificar',
}
function statusTone(s: string | null) {
  return s === 'PRESENT' ? 'success' : s === 'UNVERIFIED' || s === 'INCOMPLETE' ? 'danger' : s === 'ABSENT' ? 'danger' : 'muted'
}

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
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

export default async function AsistenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; fecha?: string; estado?: string; empleado?: string }>
}) {
  const sp = await searchParams
  const vista = sp.vista === 'revisar' ? 'revisar' : 'dia'
  const todayKey = DateTime.now().setZone(BA_ZONE).toISODate() as string
  const fecha = sp.fecha && /^\d{4}-\d{2}-\d{2}$/.test(sp.fecha) ? sp.fecha : todayKey

  const employees = await prisma.employee.findMany({
    where: { deletedAt: null },
    orderBy: { lastName: 'asc' },
    select: { id: true, firstName: true, lastName: true },
  })

  return (
    <div>
      <header className="mb-6 border-b pb-4">
        <h1 className="text-xl font-semibold tracking-tight">Asistencia</h1>
        <p className="mt-1 text-sm text-muted-foreground">Fichadas, ausencias y días a verificar.</p>
      </header>

      <div className="mb-4 flex items-center gap-1">
        <Tab href="/admin/asistencia?vista=dia" active={vista === 'dia'}>
          Del día
        </Tab>
        <Tab href="/admin/asistencia?vista=revisar" active={vista === 'revisar'}>
          Días a revisar
        </Tab>
      </div>

      {vista === 'revisar' ? <ReviewView /> : <DayView fecha={fecha} estado={sp.estado} empleado={sp.empleado} employees={employees} />}
    </div>
  )
}

async function DayView({
  fecha,
  estado,
  empleado,
  employees,
}: {
  fecha: string
  estado?: string
  empleado?: string
  employees: { id: string; firstName: string; lastName: string }[]
}) {
  const rows = await dailyAttendance(prisma, {
    workDate: workDateFromKey(fecha),
    status: estado || undefined,
    employeeId: empleado || undefined,
  })

  return (
    <>
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="vista" value="dia" />
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Fecha</label>
          <input type="date" name="fecha" defaultValue={fecha} className="h-9 rounded-md border bg-background px-3 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Estado</label>
          <select name="estado" defaultValue={estado ?? ''} className="h-9 rounded-md border bg-background px-3 text-sm">
            <option value="">Todos</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Empleado</label>
          <select name="empleado" defaultValue={empleado ?? ''} className="h-9 rounded-md border bg-background px-3 text-sm">
            <option value="">Todos</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.lastName}, {e.firstName}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="h-9 rounded-md border px-3 text-sm hover:bg-secondary">
          Filtrar
        </button>
      </form>

      {rows.length === 0 ? (
        <div className="grid place-items-center rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          No hay asistencia registrada ese día.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Empleado</th>
                <th className="px-4 py-2.5 font-medium">Entrada</th>
                <th className="px-4 py-2.5 font-medium">Salida</th>
                <th className="px-4 py-2.5 font-medium">Horas</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
                <th className="px-4 py-2.5 font-medium">Warnings</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.employeeId} className="align-top">
                  <td className="px-4 py-2.5 font-medium">{r.employeeName}</td>
                  <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                    {r.firstCheckIn ? baTimeLabel(r.firstCheckIn) : '—'}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                    {r.hasOpen ? <span className="text-primary">abierta</span> : r.lastCheckOut ? baTimeLabel(r.lastCheckOut) : '—'}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{minutesToHHMM(r.workedMinutes)}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge label={STATUS_LABELS[r.status ?? ''] ?? r.status ?? '—'} tone={statusTone(r.status)} />
                    {r.source === 'MANUAL' && <span className="ml-1 text-[10px] uppercase text-muted-foreground">manual</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-[var(--warning)]">
                    {r.warnings.length > 0 ? r.warnings.join(', ') : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <DayCorrections
                      employeeId={r.employeeId}
                      workDateKey={fecha}
                      entries={r.entries.map((e) => ({
                        id: e.id,
                        checkInLocal: instantToBaLocal(e.checkIn),
                        checkOutLocal: e.checkOut ? instantToBaLocal(e.checkOut) : '',
                      }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

async function ReviewView() {
  const rows = await reviewList(prisma)
  return rows.length === 0 ? (
    <div className="grid place-items-center rounded-lg border border-dashed py-16 text-center">
      <p className="text-sm font-medium">No hay días para revisar</p>
      <p className="mt-1 text-xs text-muted-foreground">La liquidación puede cerrar sin trabas.</p>
    </div>
  ) : (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium">Empleado</th>
            <th className="px-4 py-2.5 font-medium">Día</th>
            <th className="px-4 py-2.5 font-medium">Estado</th>
            <th className="px-4 py-2.5 font-medium">Warnings</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.attendanceId} className="transition-colors hover:bg-secondary/60">
              <td className="px-4 py-2.5 font-medium">{r.employeeName}</td>
              <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{r.workDateKey}</td>
              <td className="px-4 py-2.5">
                <StatusBadge label={STATUS_LABELS[r.status ?? ''] ?? r.status ?? '—'} tone={statusTone(r.status)} />
              </td>
              <td className="px-4 py-2.5 text-xs text-[var(--warning)]">
                <span className="inline-flex items-center gap-1 [&_svg]:size-3.5">
                  {r.warnings.length > 0 && <AlertTriangle />}
                  {r.warnings.join(', ') || '—'}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right">
                <Link
                  href={`/admin/asistencia?vista=dia&fecha=${r.workDateKey}&empleado=${r.employeeId}`}
                  className="rounded-md border px-2.5 py-1 text-xs hover:bg-secondary"
                >
                  Revisar
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
