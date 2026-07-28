'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Desplegable de opciones fijas + "Otra…", que destraba un campo de texto.
 *
 * Existe porque los campos con lista conocida pero escritos a mano se ensucian
 * solos: "sonido", "Sonido" y "SONIDO" quedan como tres cosas distintas en los
 * listados. Con la lista, el valor elegido es siempre el mismo string.
 *
 * "Otra…" es la puerta de salida a propósito: las opciones fijas cubren lo
 * habitual, pero el negocio no puede quedar esperando un deploy para dar de
 * alta algo nuevo.
 *
 * Un valor VIEJO que no está en la lista abre directamente en modo "Otra…" con
 * su texto intacto — el desplegable es para lo que se carga de ahora en más,
 * lo que ya existe se sigue viendo y editando tal cual está.
 */

/**
 * Valor centinela de la opción "Otra…". Nunca se guarda: solo destraba el campo
 * de texto. Es un carácter NUL + "otra" para que no pueda chocar con un valor
 * real escrito a mano. Vive acá, en un solo lugar, y no se duplica por form.
 */
const OTRA = '\0otra'

export function SelectConOtra({
  id,
  opciones,
  value,
  onChange,
  vacioLabel,
  otraLabel = 'Otra…',
  placeholder = 'Escribí el valor',
  className,
  disabled,
  textoAriaLabel,
}: {
  id?: string
  /** Las opciones fijas, en el orden en que se muestran. */
  opciones: readonly string[]
  /** El valor REAL (nunca el centinela). '' = sin elegir. */
  value: string
  onChange: (v: string) => void
  /** Si viene, se agrega una opción vacía con este texto (campo opcional). */
  vacioLabel?: string
  otraLabel?: string
  placeholder?: string
  className?: string
  disabled?: boolean
  /** Etiqueta accesible del campo de texto (el `label` apunta al select). */
  textoAriaLabel?: string
}) {
  const esFija = (v: string) => opciones.includes(v)

  /**
   * Si estamos en modo libre se DERIVA del valor mientras el usuario no toque
   * el desplegable, y recién ahí pasa a mandar su elección.
   *
   * No alcanza con un `useState` inicializado del valor: el inicializador corre
   * una sola vez, en el primer render, y el formulario puede entregar el valor
   * un render después. Cuando eso pasaba, un cargo viejo como "Supervisión"
   * quedaba en modo NO libre, el `<select>` no encontraba una opción que
   * matcheara y caía en la primera de la lista — o sea que guardar le cambiaba
   * el cargo al empleado sin avisar. Derivarlo lo hace inmune a ese orden.
   *
   * El estado manual sigue siendo necesario para dos casos que el valor solo no
   * distingue: recién elegí "Otra…" y todavía no escribí nada (valor vacío pero
   * modo libre), y escribí en "Otra…" algo que coincide con una opción fija
   * (que si no, cerraría el campo a mitad de la palabra).
   */
  const [libreManual, setLibreManual] = React.useState<boolean | null>(null)
  const libre = libreManual ?? (value !== '' && !esFija(value))

  // El foco va al texto solo cuando el usuario ELIGE "Otra…". Abrir un
  // formulario con un valor viejo no debe robarle el cursor.
  const [enfocar, setEnfocar] = React.useState(false)

  return (
    <>
      <select
        id={id}
        className={className}
        disabled={disabled}
        value={libre ? OTRA : value}
        onChange={(e) => {
          const v = e.target.value
          if (v === OTRA) {
            setLibreManual(true)
            setEnfocar(true)
            // Se vacía SOLO al elegir "Otra…" a propósito: así un valor viejo
            // abre con su texto y no se pierde solo.
            onChange('')
          } else {
            setLibreManual(false)
            onChange(v)
          }
        }}
      >
        {vacioLabel !== undefined && <option value="">{vacioLabel}</option>}
        {opciones.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={OTRA}>{otraLabel}</option>
      </select>
      {libre && (
        <input
          className={cn(className, 'mt-1.5')}
          value={value}
          disabled={disabled}
          autoFocus={enfocar}
          placeholder={placeholder}
          aria-label={textoAriaLabel}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </>
  )
}
