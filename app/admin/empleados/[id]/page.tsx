import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { prisma } from '@/lib/db'
import { getEmployee } from '@/lib/employees/employees'
import { EMPLOYMENT_TYPE_LABELS } from '@/lib/employees/schema'
import { minutesToHHMM } from '@/lib/employees/format'
import { DAY_LABELS } from '@/lib/employees/schema'
import { Button } from '@/components/ui/button'
import { DeleteEmployeeButton } from '@/components/employees/delete-employee-button'

function fmtDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : '—'
}

export default async function EmpleadoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const e = await getEmployee(prisma, id)
  if (!e) notFound()

  const rows: [string, string][] = [
    ['Documento', e.documentId],
    ['Email', e.email ?? '—'],
    ['Teléfono', e.phone ?? '—'],
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
          {e.schedules.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              Sin horario asignado
            </p>
          ) : (
            <ul className="divide-y rounded-lg border text-sm">
              {e.schedules.map((s) => (
                <li key={s.dayOfWeek} className="flex justify-between px-4 py-2.5">
                  <span className="text-muted-foreground">{DAY_LABELS[s.dayOfWeek]}</span>
                  <span className="tabular-nums font-medium">
                    {minutesToHHMM(s.startMinute)}–{minutesToHHMM(s.endMinute)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
