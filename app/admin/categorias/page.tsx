import Link from 'next/link'
import { Plus, Pencil } from 'lucide-react'
import { prisma } from '@/lib/db'
import { listCategories } from '@/lib/employees/categories'
import { summarizeDays } from '@/lib/employees/format'
import { Button } from '@/components/ui/button'
import { DeleteCategoryButton } from '@/components/employees/delete-category-button'

export default async function CategoriasPage() {
  const categories = await listCategories(prisma)

  return (
    <div>
      <header className="mb-6 flex items-end justify-between border-b pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Categorías</h1>
          <p className="mt-1 text-sm text-muted-foreground">Plantillas de horario del personal.</p>
        </div>
        <Link href="/admin/categorias/nueva">
          <Button>
            <Plus /> Nueva categoría
          </Button>
        </Link>
      </header>

      {categories.length === 0 ? (
        <div className="grid place-items-center rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm font-medium">Todavía no hay categorías</p>
          <p className="mt-1 text-xs text-muted-foreground">Creá la primera para asignarla a los empleados.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Nombre</th>
                <th className="px-4 py-2.5 font-medium">Plantilla</th>
                <th className="px-4 py-2.5 text-right font-medium">Empleados</th>
                <th className="w-24 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {categories.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-secondary/60">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{c.name}</div>
                    {c.description && <div className="text-xs text-muted-foreground">{c.description}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{summarizeDays(c.days)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{c.employeeCount}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/admin/categorias/${c.id}`}
                        title="Editar"
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground [&_svg]:size-4"
                      >
                        <Pencil />
                      </Link>
                      <DeleteCategoryButton id={c.id} name={c.name} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
