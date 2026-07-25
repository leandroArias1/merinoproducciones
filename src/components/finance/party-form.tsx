'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createPartyAction } from '~/app/admin/caja/actions'

/** Alta rápida de un cliente o proveedor. */
export function PartyForm({ kind }: { kind: 'CLIENT' | 'PROVIDER' }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  const label = kind === 'CLIENT' ? 'cliente' : 'proveedor'

  function submit() {
    if (!name.trim()) return
    setError(null)
    startTransition(async () => {
      const res = await createPartyAction(name.trim(), kind)
      if (!res.ok) return setError(res.error ?? 'Error.')
      setOpen(false)
      setName('')
      router.refresh()
    })
  }

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        + Nuevo {label}
      </Button>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={`Nombre del ${label}`} className="h-8 w-52 rounded-md border bg-background px-2 text-sm" />
      <Button size="sm" disabled={pending || !name.trim()} onClick={submit}>
        Crear
      </Button>
      <button className="text-xs text-muted-foreground underline" onClick={() => setOpen(false)}>
        cancelar
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  )
}
