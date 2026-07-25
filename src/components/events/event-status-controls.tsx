'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ConfirmButton } from '@/components/ui/confirm-dialog'
import { EVENT_STATUS_LABELS, type EventStatus } from '@/lib/events/schema'
import { setEventStatusAction, deleteEventAction } from '~/app/admin/eventos/actions'

const NEXT: Partial<Record<EventStatus, EventStatus>> = {
  DRAFT: 'CONFIRMED',
  CONFIRMED: 'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETED',
}

export function EventStatusControls({ id, status }: { id: string; status: EventStatus }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const next = NEXT[status]
  const closed = status === 'CANCELLED' || status === 'COMPLETED'

  // Avanzar de estado no confirma (es reversible y es el camino normal), pero sí
  // muestra "Guardando…": la mutación tarda ~3 s y el silencio se lee como colgado.
  function avanzar(to: EventStatus) {
    setError(null)
    startTransition(async () => {
      const res = await setEventStatusAction(id, to)
      if (!res.ok) return setError(res.error ?? 'Error')
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {next && (
        <Button size="sm" loading={pending} onClick={() => avanzar(next)}>
          Marcar {EVENT_STATUS_LABELS[next].toLowerCase()}
        </Button>
      )}
      {!closed && (
        <ConfirmButton
          size="sm"
          variant="secondary"
          title="¿Cancelar el evento?"
          description="Se cancelan también todas sus asignaciones, así que a nadie se le va a esperar ese día ni le va a generar una ausencia."
          confirmLabel="Sí, cancelar"
          onConfirm={() => setEventStatusAction(id, 'CANCELLED')}
        >
          Cancelar evento
        </ConfirmButton>
      )}
      <ConfirmButton
        size="sm"
        variant="ghost"
        title="¿Eliminar el evento?"
        description="Sale del listado y del calendario. Es una baja lógica: el evento y sus asignaciones se conservan en la base, pero dejan de contar en cualquier pantalla."
        confirmLabel="Sí, eliminar"
        onConfirm={async () => {
          const res = await deleteEventAction(id)
          if (!res.ok) return res
          router.push('/admin/eventos')
          router.refresh()
          return res
        }}
      >
        Eliminar
      </ConfirmButton>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
