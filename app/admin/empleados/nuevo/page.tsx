import { prisma } from '@/lib/db'
import { listCategories } from '@/lib/employees/categories'
import { EmployeeForm } from '@/components/employees/employee-form'

export default async function NuevoEmpleadoPage() {
  const categories = await listCategories(prisma)
  return (
    <div>
      <header className="mb-6 border-b pb-4">
        <h1 className="text-xl font-semibold tracking-tight">Nuevo empleado</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Al asignar una categoría se generan sus horarios desde la plantilla.
        </p>
      </header>
      <EmployeeForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  )
}
