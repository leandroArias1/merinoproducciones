import { CategoryForm } from '@/components/employees/category-form'

export default function NuevaCategoriaPage() {
  return (
    <div>
      <header className="mb-6 border-b pb-4">
        <h1 className="text-xl font-semibold tracking-tight">Nueva categoría</h1>
        <p className="mt-1 text-sm text-muted-foreground">Definí el nombre y la plantilla de horario.</p>
      </header>
      <CategoryForm />
    </div>
  )
}
