import Link from 'next/link'
import { Plus, Upload, Search } from 'lucide-react'
import { prisma } from '@/lib/db'
import { listEmployees, type EmployeeStatusFilter } from '@/lib/employees/employees'
import { listCategories } from '@/lib/employees/categories'
import { EMPLOYMENT_TYPE_LABELS, EMPLOYMENT_TYPES } from '@/lib/employees/schema'
import { Button } from '@/components/ui/button'
import { FilterForm } from '@/components/shell/filter-form'
import { FilterChips } from '@/components/shell/filter-chips'

const PAGE_SIZE = 10

function buildQuery(base: Record<string, string | undefined>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(base)) if (v) p.set(k, v)
  const s = p.toString()
  return s ? `?${s}` : ''
}

const ESTADO_NOUN: Record<EmployeeStatusFilter, string> = {
  all: 'empleado(s)',
  active: 'activo(s)',
  inactive: 'inactivo(s)',
}

export default async function EmpleadosPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; categoria?: string; contrato?: string; estado?: string; q?: string }>
}) {
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const categoria = sp.categoria || undefined
  // Se valida contra la lista: un valor cualquiera en la URL no llega a Prisma.
  const contrato = (EMPLOYMENT_TYPES as readonly string[]).includes(sp.contrato ?? '') ? sp.contrato : undefined
  const estado = (['active', 'inactive'].includes(sp.estado ?? '') ? sp.estado : 'all') as EmployeeStatusFilter
  const q = sp.q?.trim() || undefined

  const [categories, { rows, total }] = await Promise.all([
    listCategories(prisma),
    listEmployees(prisma, { page, pageSize: PAGE_SIZE, categoryId: categoria, employmentType: contrato, status: estado, search: q }),
  ])
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      <header className="mb-6 flex items-end justify-between border-b pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Empleados</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total} {ESTADO_NOUN[estado]} según el filtro.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/empleados/importar">
            <Button variant="secondary">
              <Upload /> Importar CSV
            </Button>
          </Link>
          <Link href="/admin/empleados/nuevo">
            <Button>
              <Plus /> Nuevo empleado
            </Button>
          </Link>
        </div>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FilterForm className="flex min-w-56 flex-1 flex-wrap items-center gap-2">
          <label className="flex h-9 min-w-48 flex-1 items-center gap-2 rounded-md border bg-paper px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              type="search"
              name="q"
              defaultValue={q ?? ''}
              placeholder="Buscar por nombre o DNI…"
              aria-label="Buscar empleado"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          {/* La categoría sigue en select: son tantas como horarios haya. */}
          <select
            name="categoria"
            defaultValue={categoria ?? ''}
            aria-label="Filtrar por horario"
            className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-primary"
          >
            <option value="">Todos los horarios</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {/* Contrato: separa mensuales de freelance, que era el pedido. Va con
              los cuatro tipos y no con dos chips "Mensual/Freelance", porque si
              alguien está cargado como Jornal o Por hora quedaría invisible en
              los dos filtros y parecería que no existe. */}
          <select
            name="contrato"
            defaultValue={contrato ?? ''}
            aria-label="Filtrar por tipo de contratación"
            className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-primary"
          >
            <option value="">Todos los contratos</option>
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EMPLOYMENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          {estado !== 'all' && <input type="hidden" name="estado" value={estado} />}
          <Button type="submit" variant="secondary" size="sm">
            Buscar
          </Button>
        </FilterForm>

        <FilterChips
          active={estado}
          chips={[
            { key: 'all', label: 'Todos', href: `/admin/empleados${buildQuery({ categoria, contrato, q })}` },
            { key: 'active', label: 'Activos', href: `/admin/empleados${buildQuery({ categoria, contrato, q, estado: 'active' })}` },
            { key: 'inactive', label: 'Inactivos', href: `/admin/empleados${buildQuery({ categoria, contrato, q, estado: 'inactive' })}` },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <div className="grid place-items-center rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm font-medium">No hay empleados con ese filtro</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Empleado</th>
                <th className="px-4 py-2.5 font-semibold">Documento</th>
                <th className="px-4 py-2.5 font-semibold">Cargo</th>
                <th className="px-4 py-2.5 font-semibold">Categoría</th>
                <th className="px-4 py-2.5 font-semibold">Contrato</th>
                <th className="px-4 py-2.5 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b border-[var(--border-soft)] transition-colors last:border-0 hover:bg-paper">
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/empleados/${e.id}`} className="font-medium hover:text-primary">
                      {e.lastName}, {e.firstName}
                    </Link>
                  </td>
                  <td className="num px-4 py-2.5 text-muted-foreground">{e.documentId}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{e.position ?? '—'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{e.category?.name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {EMPLOYMENT_TYPE_LABELS[e.employmentType]}
                  </td>
                  <td className="px-4 py-2.5">
                    {e.active ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                        <span className="size-1.5 rounded-full bg-[var(--success)]" /> Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="size-1.5 rounded-full bg-muted-foreground" /> Inactivo
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Página {page} de {pages}
          </span>
          <div className="flex gap-2">
            <PageLink disabled={page <= 1} href={`/admin/empleados${buildQuery({ categoria, contrato, estado, q, page: String(page - 1) })}`}>
              Anterior
            </PageLink>
            <PageLink disabled={page >= pages} href={`/admin/empleados${buildQuery({ categoria, contrato, estado, q, page: String(page + 1) })}`}>
              Siguiente
            </PageLink>
          </div>
        </div>
      )}
    </div>
  )
}

function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  if (disabled) {
    return (
      <span className="cursor-not-allowed rounded-md border px-3 py-1.5 text-muted-foreground opacity-50">
        {children}
      </span>
    )
  }
  return (
    <Link href={href} className="rounded-md border px-3 py-1.5 transition-colors hover:bg-secondary">
      {children}
    </Link>
  )
}
