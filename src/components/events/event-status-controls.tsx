'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
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

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) return setError(res.error ?? 'Error')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {next && (
        <Button size="sm" disabled={pending} onClick={() => run(() => setEventStatusAction(id, next))}>
          Marcar {EVENT_STATUS_LABELS[next].toLowerCase()}
        </Button>
      )}
      {!closed && (
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            if (confirm('¿Cancelar el evento? Se cancelan todas sus asignaciones.')) {
              run(() => setEventStatusAction(id, 'CANCELLED'))
            }
          }}
        >
          Cancelar evento
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          if (confirm('¿Eliminar el evento? (baja lógica)')) {
            startTransition(async () => {
              const res = await deleteEventAction(id)
              if (!res.ok) return setError(res.error)
              router.push('/admin/eventos')
              router.refresh()
            })
          }
        }}
      >
        Eliminar
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
