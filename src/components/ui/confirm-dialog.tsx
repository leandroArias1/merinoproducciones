'use client'

import * as React from 'react'
import { Button } from './button'
import { cn } from '@/lib/utils'

/**
 * Confirmación de acciones destructivas. Reemplaza a `window.confirm`, que era
 * feo, no se puede redactar bien y —comprobado en el QA— congela la pestaña
 * mientras está abierto.
 *
 * Se apoya en el `<dialog>` nativo, que ya trae foco atrapado, cierre con
 * Escape y capa superior sin sumar dependencias. El foco inicial va al botón
 * de CANCELAR: en una acción que mueve plata, un Enter de más no debe
 * confirmar.
 */

export interface ConfirmDialogProps {
  open: boolean
  title: string
  /** Qué pasa exactamente si confirma. Concreto: montos, nombres, consecuencias. */
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'default'
  loading?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'danger',
  loading = false,
  error = null,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = React.useRef<HTMLDialogElement>(null)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      // El <dialog> nativo trae márgenes y borde propios: se resetean acá.
      className={cn(
        'm-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border bg-surface p-0 text-foreground',
        'backdrop:bg-black/40',
      )}
      style={{ boxShadow: 'var(--shadow-overlay)' }}
      onCancel={(e) => {
        e.preventDefault() // Escape no cierra "a la fuerza": pasa por onCancel
        if (!loading) onCancel()
      }}
      onClick={(e) => {
        // Clic en el backdrop (fuera del contenido) = cancelar.
        if (e.target === ref.current && !loading) onCancel()
      }}
      aria-labelledby="confirm-title"
    >
      <div className="flex flex-col gap-3 p-5">
        <h2 id="confirm-title" className="text-base font-semibold tracking-tight">
          {title}
        </h2>
        {description && <div className="text-sm text-muted-foreground">{description}</div>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="secondary" size="sm" autoFocus disabled={loading} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'destructive' : 'primary'}
            size="sm"
            loading={loading}
            loadingText="Aplicando…"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  )
}

export interface ConfirmButtonProps
  extends Omit<React.ComponentProps<typeof Button>, 'onClick' | 'loading'> {
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  tone?: 'danger' | 'default'
  /** Se ejecuta al confirmar. Si devuelve `{ok:false}`, el error se muestra dentro del diálogo. */
  onConfirm: () => Promise<{ ok: boolean; error?: string } | void>
}

/**
 * Botón + confirmación, que es como se usa en el 90% de los casos.
 * Reemplaza el patrón `if (!confirm(msg)) return` de una línea, y de paso
 * mantiene el diálogo abierto si la acción falla, para no perder el error.
 */
export function ConfirmButton({
  title,
  description,
  confirmLabel = 'Confirmar',
  tone = 'danger',
  onConfirm,
  children,
  ...buttonProps
}: ConfirmButtonProps) {
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)

  function run() {
    setError(null)
    startTransition(async () => {
      const res = await onConfirm()
      if (res && res.ok === false) return setError(res.error ?? 'No se pudo completar.')
      setOpen(false)
    })
  }

  return (
    <>
      <Button {...buttonProps} onClick={() => { setError(null); setOpen(true) }}>
        {children}
      </Button>
      <ConfirmDialog
        open={open}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        tone={tone}
        loading={pending}
        error={error}
        onConfirm={run}
        onCancel={() => setOpen(false)}
      />
    </>
  )
}
