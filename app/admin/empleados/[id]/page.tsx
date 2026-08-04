import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { prisma } from '@/lib/db'
import { fechaAR } from '@/components/format'
import { getEmployee } from '@/lib/employees/employees'
import { getEmployeeAccess } from '@/lib/users/access'
import { EMPLOYMENT_TYPE_LABELS } from '@/lib/employees/schema'
import { minutesToHHMM } from '@/lib/employees/format'
import { DAY_LABELS } from '@/lib/employees/schema'
import { Button } from '@/components/ui/button'
import { DeleteEmployeeButton } from '@/components/employees/delete-employee-button'
import { EmployeeAccessPanel } from '@/components/employees/employee-access-panel'

function fmtDate(d: Date | null): string {
  return d ? fechaAR(d) : "—"
}

export default async function EmpleadoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [e, access] = await Promise.all([getEmployee(prisma, id), getEmployeeAccess(prisma, id)])
  if (!e) notFound()

  const vigentes = e.schedules.filter((s) => s.effectiveTo === null)
  const historicos = e.schedules.filter((s) => s.effectiveTo !== null)

  const rows: [string, string][] = [
    ['Documento', e.documentId],
    ['Email', e.email ?? '—'],
    ['Teléfono', e.phone ?? '—'],
    ['Nacimiento', fmtDate(e.birthDate)],
    ['Alias o CBU', e.alias ?? '—'],
    ['Cargo', e.position ?? '—'],
    ['Contratación', EMPLOYMENT_TYPE_LABELS[e.employmentType]],
    ['Ingreso', fmtDate(e.hireDate)],
    ['Categoría', e.category?.name ?? 'Sin categoría'],
    ['Estado', e.active ? 'Activo' : 'Inactivo'],
  ]

  return (
    <div>
      <header className="mb-6 flex items-end justify-between border-b pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {e.lastName}, {e.firstName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Legajo del empleado.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/admin/empleados/${e.id}/editar`}>
            <Button variant="secondary" size="sm">
              <Pencil /> Editar
            </Button>
          </Link>
          <DeleteEmployeeButton id={e.id} name={`${e.firstName} ${e.lastName}`} />
        </div>
      </header>

      <div className="grid max-w-3xl gap-8 sm:grid-cols-2">
        <dl className="divide-y rounded-lg border">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between px-4 py-2.5 text-sm">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>

        <div>
          <p className="mb-2 text-sm font-medium">Horario vigente</p>
          {vigentes.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              Sin horario asignado
            </p>
          ) : (
            <ul className="divide-y rounded-lg border text-sm">
              {vigentes.map((s) => (
                <li key={s.dayOfWeek} className="flex justify-between px-4 py-2.5">
                  <span className="text-muted-foreground">{DAY_LABELS[s.dayOfWeek]}</span>
                  <span className="tabular-nums font-medium">
                    {minutesToHHMM(s.startMinute)}–{minutesToHHMM(s.endMinute)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {historicos.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-muted-foreground">Historial de horarios</p>
              <ul className="divide-y rounded-lg border text-sm">
                {historicos.map((s, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="text-muted-foreground">{DAY_LABELS[s.dayOfWeek]}</span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums">
                        {minutesToHHMM(s.startMinute)}–{minutesToHHMM(s.endMinute)}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {fmtDate(s.effectiveFrom)} → {fmtDate(s.effectiveTo)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* id="acceso": desde "Editar empleado" se enlaza acá cuando todavía no
          hay cuenta de acceso y por eso no hay rol que cambiar. */}
      <div id="acceso" className="mt-8 scroll-mt-6 border-t pt-6">
        <EmployeeAccessPanel employeeId={e.id} employeeEmail={e.email} access={access} />
      </div>
    </div>
  )
}
