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
import { FilterChips } from '@/components/shell/filter-chips'
import { fechaARDesdeClave } from '@/components/format'
import { FilterForm } from '@/components/shell/filter-form'
import { ATTENDANCE_STATUS_LABELS as STATUS_LABELS, statusLabel, statusTone, warningLabel } from '@/lib/attendance/labels'

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
        <FilterChips
          active={vista}
          chips={[
            { key: "dia", label: "Del día", href: "/admin/asistencia?vista=dia" },
            { key: "revisar", label: "Días a revisar", href: "/admin/asistencia?vista=revisar" },
          ]}
        />
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
      <FilterForm className="mb-4 flex flex-wrap items-end gap-3">
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
      </FilterForm>

      {rows.length === 0 ? (
        <div className="grid place-items-center rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          No hay asistencia registrada ese día.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-surface">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Empleado</th>
                <th className="px-4 py-2.5 font-semibold">Entrada</th>
                <th className="px-4 py-2.5 font-semibold">Salida</th>
                <th className="px-4 py-2.5 font-semibold">Horas</th>
                <th className="px-4 py-2.5 font-semibold">Estado</th>
                <th className="px-4 py-2.5 font-semibold">Warnings</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employeeId} className="align-top">
                  <td className="px-4 py-2.5 font-medium">{r.employeeName}</td>
                  <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                    {r.firstCheckIn ? baTimeLabel(r.firstCheckIn) : '—'}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                    {r.hasOpen ? <span className="text-primary">abierta</span> : r.lastCheckOut ? baTimeLabel(r.lastCheckOut) : '—'}
                  </td>
                  <td className="px-4 py-2.5 num">{minutesToHHMM(r.workedMinutes)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <StatusBadge label={statusLabel(r.status)} tone={statusTone(r.status)} />
                      {r.source === 'MANUAL' && (
                        <span className="rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          manual
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-[var(--warning)]">
                    {r.warnings.length > 0 ? r.warnings.map(warningLabel).join(', ') : '—'}
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
    <div className="overflow-x-auto rounded-lg border bg-surface">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-b text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-semibold">Empleado</th>
            <th className="px-4 py-2.5 font-semibold">Día</th>
            <th className="px-4 py-2.5 font-semibold">Estado</th>
            <th className="px-4 py-2.5 font-semibold">Warnings</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.attendanceId} className="border-b border-[var(--border-soft)] transition-colors last:border-0 hover:bg-paper">
              <td className="px-4 py-2.5 font-medium">{r.employeeName}</td>
              <td className="num px-4 py-2.5 text-muted-foreground">{fechaARDesdeClave(r.workDateKey)}</td>
              <td className="px-4 py-2.5">
                <StatusBadge label={statusLabel(r.status)} tone={statusTone(r.status)} />
              </td>
              <td className="px-4 py-2.5 text-xs text-[var(--warning)]">
                <span className="inline-flex items-center gap-1 [&_svg]:size-3.5">
                  {r.warnings.length > 0 && <AlertTriangle />}
                  {r.warnings.map(warningLabel).join(', ') || '—'}
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
