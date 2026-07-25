'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { registerExpenseAction } from '~/app/admin/caja/actions'

const inputCls = 'h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-primary'

const CATS = [
  ['TRANSPORT', 'Transporte'],
  ['EQUIPMENT', 'Equipos'],
  ['VENUE', 'Lugar'],
  ['SUPPLIES', 'Insumos'],
  ['OTHER', 'Otro'],
] as const

export function NewExpenseForm({
  providers,
  events,
}: {
  providers: { id: string; name: string }[]
  events: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const [description, setDescription] = useState('')
  const [pesos, setPesos] = useState('')
  const [category, setCategory] = useState('OTHER')
  const [providerId, setProviderId] = useState('')
  const [eventId, setEventId] = useState('')
  const [payNow, setPayNow] = useState(false)

  const monto = Number(pesos)
  const valid = description.trim() !== '' && monto > 0

  function submit() {
    if (!valid) return
    setError(null)
    startTransition(async () => {
      const res = await registerExpenseAction({
        description,
        amountPesos: monto,
        category,
        providerId: providerId || null,
        eventId: eventId || null,
        payNow,
      })
      if (!res.ok) return setError(res.error ?? 'Error.')
      setDone(true)
      setDescription('')
      setPesos('')
      setProviderId('')
      setEventId('')
      setPayNow(false)
      router.refresh()
    })
  }

  return (
    <div className="max-w-xl space-y-3 rounded-lg border p-4">
      <p className="text-sm font-medium">Nuevo gasto</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-xs text-muted-foreground">Descripción</label>
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Alquiler de sonido" />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground">Monto (pesos)</label>
          <input type="number" min={0} className={inputCls} value={pesos} onChange={(e) => setPesos(e.target.value)} placeholder="50000" />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground">Categoría</label>
          <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground">Proveedor (opcional)</label>
          <select className={inputCls} value={providerId} onChange={(e) => setProviderId(e.target.value)}>
            <option value="">—</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground">Imputar a evento (opcional)</label>
          <select className={inputCls} value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">Sin evento</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={payNow} onChange={(e) => setPayNow(e.target.checked)} />
        Pagado al toque (sale de caja ahora). Sin tildar, queda como cuenta por pagar.
      </label>
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={pending || !valid} onClick={submit}>
          Registrar gasto
        </Button>
        {done && !error && <span className="text-xs text-[var(--success)]">Guardado.</span>}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  )
}
