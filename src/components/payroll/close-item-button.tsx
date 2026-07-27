'use client'

import { Lock } from 'lucide-react'
import { ConfirmButton } from '@/components/ui/confirm-dialog'
import { closeItemAction } from '~/app/admin/liquidaciones/actions'

/**
 * Cierra el recibo de UN empleado que estaba bloqueado y ya no lo está, sin
 * reabrir el mes. Es la salida que faltaba: antes, un día resuelto después del
 * cierre dejaba a esa persona trabada para siempre.
 */
export function CloseItemButton({ year, month, employeeId, employeeName, netLabel }: { year: number; month: number; employeeId: string; employeeName: string; netLabel: string }) {
  return (
    <ConfirmButton
      size="sm"
      variant="secondary"
      title="¿Generar el recibo?"
      description={`Se cierra el recibo de ${employeeName} por ${netLabel}, con el mismo cálculo que el resto del mes. Los recibos ya cerrados no cambian.`}
      confirmLabel="Sí, generar recibo"
      tone="default"
      onConfirm={() => closeItemAction(year, month, employeeId)}
    >
      <Lock /> Generar recibo
    </ConfirmButton>
  )
}
