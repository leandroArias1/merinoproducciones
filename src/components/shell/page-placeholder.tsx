/**
 * Placeholder de página (esta sesión es solo auth + shells: sin CRUD todavía).
 * Encabezado denso + estado vacío sobrio.
 */
export function PagePlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <header className="mb-6 border-b pb-4">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </header>
      <div className="grid place-items-center rounded-lg border border-dashed py-16 text-center">
        <p className="text-sm font-medium text-foreground">Todavía no hay nada acá</p>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          Este módulo se implementa en una etapa siguiente.
        </p>
      </div>
    </div>
  )
}
