import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getEmployee } from '@/lib/employees/employees'
import { listCategories } from '@/lib/employees/categories'
import { EmployeeForm } from '@/components/employees/employee-form'

export default async function EditarEmpleadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [e, categories] = await Promise.all([getEmployee(prisma, id), listCategories(prisma)])
  if (!e) notFound()

  return (
    <div>
      <header className="mb-6 border-b pb-4">
        <h1 className="text-xl font-semibold tracking-tight">Editar empleado</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cambiar la categoría versiona los horarios: cierra el vigente y abre el nuevo desde hoy.
        </p>
      </header>
      <EmployeeForm
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        initial={{
          id: e.id,
          firstName: e.firstName,
          lastName: e.lastName,
          documentId: e.documentId,
          email: e.email ?? '',
          phone: e.phone ?? '',
          position: e.position ?? '',
          employmentType: e.employmentType,
          hireDate: e.hireDate ? e.hireDate.toISOString().slice(0, 10) : '',
          categoryId: e.categoryId ?? '',
          active: e.active,
        }}
      />
    </div>
  )
}
