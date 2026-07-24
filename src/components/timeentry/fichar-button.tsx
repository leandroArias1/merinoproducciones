'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Fingerprint, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { clockInAction, clockOutAction } from '~/app/empleado/actions'
import { getBrowserLocation } from './geo'

export function FicharButton({ nextAction }: { nextAction: 'entrada' | 'salida' }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onClick() {
    setError(null)
    startTransition(async () => {
      const location = await getBrowserLocation()
      const res = nextAction === 'entrada' ? await clockInAction(location) : await clockOutAction(location)
      if (!res.ok) return setError(res.error)
      router.refresh()
    })
  }

  const salida = nextAction === 'salida'
  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={cn(
          'flex min-h-40 w-full flex-col items-center justify-center gap-3 rounded-xl px-6 text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-70 [&_svg]:size-12',
          salida ? 'bg-foreground' : 'bg-primary',
        )}
      >
        {salida ? <LogOut /> : <Fingerprint />}
        <span className="text-3xl font-bold uppercase tracking-wide">
          {pending ? 'Registrando…' : salida ? 'Fichar salida' : 'Fichar entrada'}
        </span>
      </button>
      {error && (
        <p role="alert" className="mt-3 text-center text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
