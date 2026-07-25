'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { registerClientPaymentAction } from '~/app/admin/caja/actions'

/** Registrar un pago (parcial) de cliente para un evento. Inline en la fila. */
export function PaymentForm({ eventId }: { eventId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [pesos, setPesos] = useState('')

  const monto = Number(pesos)
  const valid = monto > 0

  function submit() {
    if (!valid) return
    setError(null)
    startTransition(async () => {
      const res = await registerClientPaymentAction(eventId, monto)
      if (!res.ok) return setError(res.error ?? 'Error.')
      setOpen(false)
      setPesos('')
      router.refresh()
    })
  }

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Registrar pago
      </Button>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        type="number"
        min={0}
        autoFocus
        value={pesos}
        onChange={(e) => setPesos(e.target.value)}
        placeholder="pesos"
        className="h-8 w-28 rounded-md border bg-background px-2 text-sm"
      />
      <Button size="sm" disabled={pending || !valid} onClick={submit}>
        Cobrar
      </Button>
      <button className="text-xs text-muted-foreground underline" onClick={() => setOpen(false)}>
        cancelar
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  )
}
