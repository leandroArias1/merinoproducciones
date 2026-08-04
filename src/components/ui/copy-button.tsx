'use client'

import * as React from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Copia un valor al portapapeles y lo dice.
 *
 * El feedback no es decorativo: copiar no cambia nada en pantalla, así que sin
 * confirmación uno no sabe si funcionó y vuelve a apretar. Durante un pago eso
 * significa dudar de si el alias que está por pegar es el correcto.
 *
 * `value` es lo que se copia, que NO es necesariamente lo que se ve: el monto
 * se muestra "$ 810.000" y se copia "810000", porque el homebanking rechaza el
 * símbolo y los puntos — y sacarlos a mano es justo lo que este botón evita.
 */
export function CopyButton({
  value,
  label,
  className,
}: {
  value: string
  /** Qué se está copiando, para el lector de pantalla ("alias", "monto"). */
  label: string
  className?: string
}) {
  const [copiado, setCopiado] = React.useState(false)
  const [fallo, setFallo] = React.useState(false)

  React.useEffect(() => {
    if (!copiado && !fallo) return
    const t = setTimeout(() => {
      setCopiado(false)
      setFallo(false)
    }, 1500)
    return () => clearTimeout(t)
  }, [copiado, fallo])

  async function copiar() {
    try {
      await navigator.clipboard.writeText(value)
      setCopiado(true)
    } catch {
      // Sin permiso de portapapeles (o contexto no seguro): se avisa en vez de
      // quedarse mudo, para que el usuario sepa que tiene que copiar a mano.
      setFallo(true)
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      aria-label={`Copiar ${label}`}
      title={`Copiar ${label}`}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground',
        'hover:bg-secondary hover:text-foreground [&_svg]:size-3',
        copiado && 'border-[var(--success)]/40 text-[var(--success)]',
        fallo && 'border-destructive/40 text-destructive',
        className,
      )}
    >
      {copiado ? <Check /> : <Copy />}
      <span aria-live="polite">{copiado ? 'copiado' : fallo ? 'copiá a mano' : 'copiar'}</span>
    </button>
  )
}
