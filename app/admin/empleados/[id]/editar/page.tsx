import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getEmployee } from '@/lib/employees/employees'
import { listCategories } from '@/lib/employees/categories'
import { getEmployeeAccess } from '@/lib/users/access'
import { EmployeeForm } from '@/components/employees/employee-form'

export default async function EditarEmpleadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // El acceso se lee acá y en el legajo desde la MISMA fuente (`User.role`):
  // por eso los dos selectores de rol quedan sincronizados solos.
  const [e, categories, access] = await Promise.all([
    getEmployee(prisma, id),
    listCategories(prisma),
    getEmployeeAccess(prisma, id),
  ])
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
        access={access}
        initial={{
          id: e.id,
          firstName: e.firstName,
          lastName: e.lastName,
          documentId: e.documentId,
          email: e.email ?? '',
          phone: e.phone ?? '',
          birthDate: e.birthDate ? e.birthDate.toISOString().slice(0, 10) : '',
          alias: e.alias ?? '',
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
