'use client'

import { useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

/**
 * Form de filtros con navegación por el router + estado `pending`: al aplicar,
 * la transición dispara el skeleton (loading.tsx) y el form se atenúa con un
 * "Actualizando…" — feedback inmediato aunque la query tarde. Reemplaza al
 * <form method="get"> nativo, que hacía una navegación dura sin feedback.
 *
 * LOS DESPLEGABLES SE APLICAN SOLOS. Antes había que elegir y además apretar
 * "Buscar", y eso se lee como que el filtro está roto: elegís "Freelance", no
 * pasa nada, y concluís que no anda. Le pasó al propio autor del sistema.
 *
 * El buscador de TEXTO sigue con su botón, y es la diferencia que importa: en
 * un desplegable elegir YA ES la decisión, mientras que un texto se escribe de
 * a una letra y aplicarlo en cada tecla sería absurdo. Por eso el auto-submit
 * mira que el cambio venga de un <select> y no de cualquier campo — un input de
 * texto también emite `change` (al perder el foco), y sin ese filtro salir del
 * buscador dispararía una búsqueda que nadie pidió.
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

  function onChange(e: React.ChangeEvent<HTMLFormElement>) {
    if ((e.target as HTMLElement).tagName !== 'SELECT') return
    // Pasa por el mismo onSubmit: el texto ya escrito y los hidden viajan en el
    // FormData, así que elegir un desplegable no pisa lo que el usuario tenía.
    e.currentTarget.requestSubmit()
  }

  return (
    <form
      onSubmit={onSubmit}
      onChange={onChange}
      className={cn(className, 'transition-opacity', pending && 'pointer-events-none opacity-60')}
    >
      {children}
      {pending && <span className="self-center text-xs text-muted-foreground">Actualizando…</span>}
    </form>
  )
}
