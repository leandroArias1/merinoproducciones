'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { MoneyEcho } from '@/components/ui/money-echo'
import { setEventPriceAction } from '~/app/admin/caja/actions'

/** Cargar/editar el precio pactado + cliente de un evento (la cuenta por cobrar). */
export function SetPriceForm({
  eventId,
  clients,
  currentPesos,
  currentClientId,
  cta = 'Cargar precio',
}: {
  eventId: string
  clients: { id: string; name: string }[]
  currentPesos?: number
  currentClientId?: string | null
  cta?: string
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [pesos, setPesos] = useState(currentPesos != null ? String(currentPesos) : '')
  const [clientId, setClientId] = useState(currentClientId ?? '')

  const monto = Number(pesos)
  const valid = monto >= 0 && pesos !== ''

  function submit() {
    if (!valid) return
    setError(null)
    startTransition(async () => {
      const res = await setEventPriceAction(eventId, monto, clientId || null)
      if (!res.ok) return setError(res.error ?? 'Error.')
      setOpen(false)
    })
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        {cta}
      </Button>
    )
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <input type="number" min={0} autoFocus value={pesos} onChange={(e) => setPesos(e.target.value)} placeholder="precio $" className="h-8 w-28 rounded-md border bg-background px-2 text-sm" />
      <MoneyEcho raw={pesos} />
      <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-sm">
        <option value="">Cliente…</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <Button size="sm" disabled={!valid} loading={pending} onClick={submit}>
        Guardar
      </Button>
      <button className="text-xs text-muted-foreground underline" onClick={() => setOpen(false)}>
        cancelar
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  )
}
