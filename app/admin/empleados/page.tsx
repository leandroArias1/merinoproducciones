import Link from 'next/link'
import { Plus, Upload } from 'lucide-react'
import { prisma } from '@/lib/db'
import { listEmployees, type EmployeeStatusFilter } from '@/lib/employees/employees'
import { listCategories } from '@/lib/employees/categories'
import { EMPLOYMENT_TYPE_LABELS } from '@/lib/employees/schema'
import { Button } from '@/components/ui/button'

const PAGE_SIZE = 10

function buildQuery(base: Record<string, string | undefined>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(base)) if (v) p.set(k, v)
  const s = p.toString()
  return s ? `?${s}` : ''
}

export default async function EmpleadosPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; categoria?: string; estado?: string }>
}) {
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const categoria = sp.categoria || undefined
  const estado = (['active', 'inactive'].includes(sp.estado ?? '') ? sp.estado : 'all') as EmployeeStatusFilter

  const [categories, { rows, total }] = await Promise.all([
    listCategories(prisma),
    listEmployees(prisma, { page, pageSize: PAGE_SIZE, categoryId: categoria, status: estado }),
  ])
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      <header className="mb-6 flex items-end justify-between border-b pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Empleados</h1>
          <p className="mt-1 text-sm text-muted-foreground">{total} activo(s) según el filtro.</p>
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

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Categoría</label>
          <select
            name="categoria"
            defaultValue={categoria ?? ''}
            className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-primary"
          >
            <option value="">Todas</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Estado</label>
          <select
            name="estado"
            defaultValue={estado}
            className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-primary"
          >
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </div>
        <Button type="submit" variant="secondary" size="sm">
          Filtrar
        </Button>
      </form>

      {rows.length === 0 ? (
        <div className="grid place-items-center rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm font-medium">No hay empleados con ese filtro</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Empleado</th>
                <th className="px-4 py-2.5 font-medium">Documento</th>
                <th className="px-4 py-2.5 font-medium">Cargo</th>
                <th className="px-4 py-2.5 font-medium">Categoría</th>
                <th className="px-4 py-2.5 font-medium">Contrato</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((e) => (
                <tr key={e.id} className="transition-colors hover:bg-secondary/60">
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/empleados/${e.id}`} className="font-medium hover:text-primary">
                      {e.lastName}, {e.firstName}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{e.documentId}</td>
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
            <PageLink disabled={page <= 1} href={`/admin/empleados${buildQuery({ categoria, estado, page: String(page - 1) })}`}>
              Anterior
            </PageLink>
            <PageLink disabled={page >= pages} href={`/admin/empleados${buildQuery({ categoria, estado, page: String(page + 1) })}`}>
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
