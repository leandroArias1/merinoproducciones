import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getCategory } from '@/lib/employees/categories'
import { CategoryForm } from '@/components/employees/category-form'

export default async function EditarCategoriaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const category = await getCategory(prisma, id)
  if (!category) notFound()

  return (
    <div>
      <header className="mb-6 border-b pb-4">
        <h1 className="text-xl font-semibold tracking-tight">Editar categoría</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Los cambios de plantilla aplican a futuras asignaciones; no reescriben horarios ya generados.
        </p>
      </header>
      <CategoryForm
        initial={{ id: category.id, name: category.name, description: category.description, days: category.days }}
      />
    </div>
  )
}
