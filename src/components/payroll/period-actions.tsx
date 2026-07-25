'use client'

import { useState, useTransition } from 'react'
import { Lock, BadgeCheck, Unlock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { closePeriodAction, payPeriodAction, reopenPeriodAction } from '~/app/admin/liquidaciones/actions'

type Status = 'OPEN' | 'CLOSED' | 'PAID' | 'NONE'

export function PeriodActions({ year, month, status, canClose }: { year: number; month: number; status: Status; canClose: boolean }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, confirmMsg: string) {
    if (!confirm(confirmMsg)) return
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) return setError(res.error ?? 'Error.')
    })
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        {(status === 'OPEN' || status === 'NONE') && (
          <Button
            size="sm"
            disabled={pending || !canClose}
            onClick={() => run(() => closePeriodAction(year, month), '¿Cerrar el período? Se liquidan los empleados listos; los bloqueados quedan pendientes.')}
          >
            <Lock /> Cerrar período
          </Button>
        )}
        {status === 'CLOSED' && (
          <>
            <Button size="sm" disabled={pending} onClick={() => run(() => payPeriodAction(year, month), '¿Marcar el período como PAGADO? No se podrá reabrir.')}>
              <BadgeCheck /> Marcar pagado
            </Button>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => reopenPeriodAction(year, month), '¿Reabrir el período para corregir? Los recibos se van a recalcular al volver a cerrar.')}>
              <Unlock /> Reabrir
            </Button>
          </>
        )}
        {status === 'PAID' && (
          <Button size="sm" variant="secondary" disabled title="Un período pagado no se reabre; corregí con un ajuste el mes siguiente.">
            <Unlock /> Reabrir
          </Button>
        )}
      </div>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
