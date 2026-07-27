'use client'

import { Lock, BadgeCheck, Unlock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmButton } from '@/components/ui/confirm-dialog'
import { closePeriodAction, payPeriodAction, reopenPeriodAction } from '~/app/admin/liquidaciones/actions'

type Status = 'OPEN' | 'CLOSED' | 'PAID' | 'NONE'

/**
 * Cerrar, pagar y reabrir un período. Las tres mueven sueldos, así que las tres
 * confirman diciendo qué pasa —y "marcar pagado" avisa que es sin vuelta atrás,
 * que es la única de las tres que no se puede deshacer.
 */
export function PeriodActions({
  year,
  month,
  status,
  canClose,
  pendientes = 0,
}: {
  year: number
  month: number
  status: Status
  canClose: boolean
  /** Empleados del mes todavía sin recibo. Con uno solo, pagar queda deshabilitado. */
  pendientes?: number
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {(status === 'OPEN' || status === 'NONE') && (
        <ConfirmButton
          size="sm"
          disabled={!canClose}
          title="¿Cerrar el período?"
          description="Se generan los recibos de los empleados que están listos. Los que estén bloqueados quedan afuera y podés cerrarlos después, cuando resuelvas sus días sin verificar."
          confirmLabel="Sí, cerrar"
          tone="default"
          onConfirm={() => closePeriodAction(year, month)}
        >
          <Lock /> Cerrar período
        </ConfirmButton>
      )}
      {status === 'CLOSED' && (
        <>
          {pendientes > 0 ? (
            // Pagar es la única acción sin vuelta atrás: con alguien sin recibo,
            // pagar lo dejaría sin liquidar para siempre. El back también lo
            // rechaza; esto es para que no llegue ni a intentarlo.
            <Button size="sm" disabled title={`Hay ${pendientes} empleado(s) sin recibo. Generá sus recibos antes de pagar: un período pagado no se puede reabrir.`}>
              <BadgeCheck /> Marcar pagado
            </Button>
          ) : (
            <ConfirmButton
              size="sm"
              title="¿Marcar el período como pagado?"
              description="Esto no tiene vuelta atrás: un período pagado ya no se puede reabrir. Si después hay que corregir algo, se hace con un ajuste el mes siguiente."
              confirmLabel="Sí, marcar pagado"
              onConfirm={() => payPeriodAction(year, month)}
            >
              <BadgeCheck /> Marcar pagado
            </ConfirmButton>
          )}
          <ConfirmButton
            size="sm"
            variant="secondary"
            title="¿Reabrir el período?"
            description="Vuelve a quedar abierto para corregir. Los recibos se recalculan cuando lo vuelvas a cerrar, así que los montos pueden cambiar."
            confirmLabel="Sí, reabrir"
            tone="default"
            onConfirm={() => reopenPeriodAction(year, month)}
          >
            <Unlock /> Reabrir
          </ConfirmButton>
        </>
      )}
      {status === 'PAID' && (
        <Button size="sm" variant="secondary" disabled title="Un período pagado no se reabre; corregí con un ajuste el mes siguiente.">
          <Unlock /> Reabrir
        </Button>
      )}
    </div>
  )
}
