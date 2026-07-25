'use client'

import { useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

/**
 * Form de filtros con navegación por el router + estado `pending`: al aplicar,
 * la transición dispara el skeleton (loading.tsx) y el form se atenúa con un
 * "Actualizando…" — feedback inmediato aunque la query tarde. Reemplaza al
 * <form method="get"> nativo, que hacía una navegación dura sin feedback.
 */
export function FilterForm({ children, className }: { children: React.ReactNode; className?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const params = new URLSearchParams()
    for (const [k, v] of fd.entries()) {
      if (typeof v === 'string' && v !== '') params.set(k, v)
    }
    const qs = params.toString()
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname))
  }

  return (
    <form
      onSubmit={onSubmit}
      className={cn(className, 'transition-opacity', pending && 'pointer-events-none opacity-60')}
    >
      {children}
      {pending && <span className="self-center text-xs text-muted-foreground">Actualizando…</span>}
    </form>
  )
}
