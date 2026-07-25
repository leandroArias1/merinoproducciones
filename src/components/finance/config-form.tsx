'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { setDeductionAction } from '~/app/admin/caja/actions'

/** Config del descuento por falta (versiona PayrollConfig). */
export function ConfigForm({ currentPesos }: { currentPesos: number | null }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pesos, setPesos] = useState(currentPesos != null ? String(currentPesos) : '')

  const monto = Number(pesos)
  const valid = monto >= 0 && pesos !== ''

  function submit() {
    if (!valid) return
    setError(null)
    setDone(false)
    startTransition(async () => {
      const res = await setDeductionAction(monto)
      if (!res.ok) return setError(res.error ?? 'Error.')
      setDone(true)
    })
  }

  return (
    <div className="max-w-md space-y-3 rounded-lg border p-4">
      <div>
        <label className="block text-xs text-muted-foreground">Descuento por falta injustificada (pesos por día ABSENT)</label>
        <input type="number" min={0} value={pesos} onChange={(e) => setPesos(e.target.value)} placeholder="30000" className="mt-1 h-9 w-40 rounded-md border bg-background px-3 text-sm" />
      </div>
      <p className="text-xs text-muted-foreground">Se versiona: los meses ya liquidados conservan el valor que estaba vigente entonces.</p>
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!valid} loading={pending} onClick={submit}>
          Guardar
        </Button>
        {done && !error && <span className="text-xs text-[var(--success)]">Actualizado.</span>}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  )
}
