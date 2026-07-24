import { ImportWizard } from '@/components/employees/import-wizard'

export default function ImportarEmpleadosPage() {
  return (
    <div>
      <header className="mb-6 border-b pb-4">
        <h1 className="text-xl font-semibold tracking-tight">Importar empleados</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Subí un CSV. Vas a ver un preview con qué se crea y qué se saltea antes de confirmar; nada
          se escribe hasta entonces.
        </p>
      </header>
      <ImportWizard />
    </div>
  )
}
