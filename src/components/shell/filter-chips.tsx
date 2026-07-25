import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * Filtro de pocas opciones excluyentes, como segmentos pegados en vez de un
 * `<select>`: se ve el universo completo de un vistazo y se cambia con un solo
 * clic, sin desplegar. Son enlaces, así que funcionan sin JavaScript y el
 * estado queda en la URL (compartible y con historial).
 *
 * Para más de cuatro o cinco opciones conviene el `<select>`: los chips dejan
 * de entrar y se rompe la línea.
 */
export interface Chip {
  key: string
  label: string
  href: string
}

export function FilterChips({ chips, active, label }: { chips: Chip[]; active: string; label?: string }) {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-xs font-medium text-muted-foreground">{label}</span>}
      <div className="flex overflow-hidden rounded-md border" role="group" aria-label={label}>
        {chips.map((c, i) => (
          <Link
            key={c.key}
            href={c.href}
            prefetch={false}
            aria-current={active === c.key ? 'true' : undefined}
            className={cn(
              'px-3 py-1.5 text-sm transition-colors',
              i > 0 && 'border-l',
              active === c.key
                ? 'bg-foreground font-semibold text-background'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
          >
            {c.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
