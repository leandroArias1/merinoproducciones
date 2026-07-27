import { ecoPesos } from '@/components/format'
import { cn } from '@/lib/utils'

/**
 * Muestra en grande lo que el usuario acaba de escribir en un campo de monto,
 * ya formateado: "750000" → "$ 750.000". Sirve para una sola cosa — que un
 * cero de más o de menos SE VEA antes de guardar.
 *
 * No participa del guardado: el form sigue leyendo el input. Si el campo está
 * vacío o no es un número, no se dibuja nada (no molesta mientras se tipea).
 *
 * `aria-live` para que el eco también le llegue a quien usa lector de pantalla:
 * es exactamente la gente para la que confirmar el monto importa más.
 */
export function MoneyEcho({ raw, className }: { raw: string; className?: string }) {
  const eco = ecoPesos(raw)
  if (!eco) return null
  return (
    <p aria-live="polite" className={cn('num text-sm font-semibold tracking-tight', className)}>
      {eco}
    </p>
  )
}
