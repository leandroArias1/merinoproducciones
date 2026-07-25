'use client'

import * as React from 'react'
import { ConfirmButton } from '@/components/ui/confirm-dialog'
import { payExpenseAction, deleteMovementAction, deleteExpenseAction } from '~/app/admin/caja/actions'

type Kind = 'pay' | 'delete-movement' | 'delete-expense'

const RUN: Record<Kind, (id: string) => Promise<{ ok: boolean; error?: string }>> = {
  pay: (id) => payExpenseAction(id),
  'delete-movement': (id) => deleteMovementAction(id),
  'delete-expense': (id) => deleteExpenseAction(id),
}

/**
 * Acciones de plata, con confirmación.
 *
 * La confirmación NO es un "¿estás seguro?" genérico: `description` dice qué
 * va a pasar con números concretos —cuánto se mueve el saldo, qué vuelve a
 * figurar como impago—, porque quien aprieta acá mueve dinero real y merece
 * saber qué está firmando. El texto lo arma la pantalla, que es la que tiene
 * el contexto (monto, concepto, si el gasto vuelve a deberse).
 */
export function FinanceActionButton({
  kind,
  id,
  label,
  title,
  description,
  variant = 'secondary',
  confirmLabel,
}: {
  kind: Kind
  id: string
  label: string
  title: string
  description: React.ReactNode
  variant?: 'secondary' | 'ghost'
  confirmLabel?: string
}) {
  return (
    <ConfirmButton
      size="sm"
      variant={variant}
      title={title}
      description={description}
      confirmLabel={confirmLabel ?? label}
      tone="danger"
      onConfirm={() => RUN[kind](id)}
    >
      {label}
    </ConfirmButton>
  )
}
