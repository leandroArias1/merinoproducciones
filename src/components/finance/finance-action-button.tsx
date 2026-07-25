'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { payExpenseAction, deleteMovementAction, deleteExpenseAction } from '~/app/admin/caja/actions'

type Kind = 'pay' | 'delete-movement' | 'delete-expense'

const RUN: Record<Kind, (id: string) => Promise<{ ok: boolean; error?: string }>> = {
  pay: (id) => payExpenseAction(id),
  'delete-movement': (id) => deleteMovementAction(id),
  'delete-expense': (id) => deleteExpenseAction(id),
}

export function FinanceActionButton({
  kind,
  id,
  label,
  confirm: confirmMsg,
  variant = 'secondary',
}: {
  kind: Kind
  id: string
  label: string
  confirm: string
  variant?: 'secondary' | 'ghost'
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onClick() {
    if (!confirm(confirmMsg)) return
    setError(null)
    startTransition(async () => {
      const res = await RUN[kind](id)
      if (!res.ok) return setError(res.error ?? 'Error.')
      router.refresh()
    })
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Button size="sm" variant={variant} disabled={pending} onClick={onClick}>
        {label}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  )
}
