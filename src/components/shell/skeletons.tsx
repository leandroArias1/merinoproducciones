import { cn } from '@/lib/utils'

/** Bloque gris con pulse. Base de todos los skeletons de carga. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-secondary', className)} />
}

/** Encabezado de página (título + subtítulo). */
export function HeaderSkeleton() {
  return (
    <div className="mb-6 space-y-2 border-b pb-4">
      <Skeleton className="h-6 w-44" />
      <Skeleton className="h-4 w-64" />
    </div>
  )
}

/** Fila de filtros (selects + botón). */
export function FiltersSkeleton() {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <Skeleton className="h-9 w-40" />
      <Skeleton className="h-9 w-40" />
      <Skeleton className="h-9 w-20" />
    </div>
  )
}

/** Tabla con `rows` filas y `cols` columnas. */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="border-b bg-secondary/40 px-4 py-3">
        <Skeleton className="h-3 w-28" />
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            {Array.from({ length: cols }).map((_, j) => (
              <Skeleton key={j} className={cn('h-4', j === 0 ? 'w-40' : 'w-20')} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
