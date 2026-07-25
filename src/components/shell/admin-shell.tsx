'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, LayoutDashboard, Users, Tags, CalendarDays, ClipboardCheck, Wallet, Coins, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LogoutButton } from './logout-button'

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/empleados', label: 'Empleados', icon: Users },
  { href: '/admin/categorias', label: 'Categorías', icon: Tags },
  { href: '/admin/eventos', label: 'Eventos', icon: CalendarDays },
  { href: '/admin/asistencia', label: 'Asistencia', icon: ClipboardCheck },
  { href: '/admin/liquidaciones', label: 'Liquidaciones', icon: Wallet },
  { href: '/admin/caja', label: 'Caja', icon: Coins },
  { href: '/admin/reportes', label: 'Reportes', icon: BarChart3 },
] as const

function Brand() {
  return (
    <span className="text-sm font-semibold tracking-tight">
      Merino <span className="text-primary">Producciones</span>
    </span>
  )
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === '/admin' ? pathname === href : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            // Sin prefetch: los 8 links están en viewport en desktop, así que
            // Next ejecutaba las 8 páginas enteras (queries + sesión) al montar
            // el shell. Medido: con 8 pedidos en paralelo cada uno pasa de ~1 s
            // a 2,5-3,4 s por contención. La navegación sigue siendo cliente.
            prefetch={false}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors [&_svg]:size-4 [&_svg]:shrink-0',
              active
                ? 'bg-secondary font-medium text-foreground'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
          >
            <Icon strokeWidth={2} />
            {label}
          </Link>
        )
      })}
    </>
  )
}

function SidebarFooter({ userLabel }: { userLabel: string }) {
  return (
    <div className="flex items-center justify-between border-t p-3">
      <span className="truncate text-xs text-muted-foreground" title={userLabel}>
        {userLabel}
      </span>
      <LogoutButton />
    </div>
  )
}

/**
 * Shell del admin. En desktop (md+) el sidebar es una columna fija; en mobile
 * se colapsa en un drawer con hamburguesa para no comerse el ancho (era el bug
 * de responsive del QA). El contenido nunca queda inalcanzable en pantallas
 * angostas.
 */
export function AdminShell({ userLabel, children }: { userLabel: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // Cerrar el drawer al navegar.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <div className="min-h-[100dvh] md:grid md:grid-cols-[15rem_1fr]">
      {/* Sidebar fijo (desktop) */}
      <aside className="hidden border-r bg-background md:flex md:flex-col">
        <div className="flex h-12 items-center border-b px-4">
          <Brand />
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          <NavLinks pathname={pathname} />
        </nav>
        <SidebarFooter userLabel={userLabel} />
      </aside>

      {/* Header mobile con hamburguesa */}
      <header className="flex h-12 items-center gap-3 border-b bg-background px-3 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
          className="grid size-8 place-items-center rounded-md hover:bg-secondary [&_svg]:size-5"
        >
          <Menu />
        </button>
        <Brand />
      </header>

      {/* Drawer mobile */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r bg-background shadow-xl">
            <div className="flex h-12 items-center justify-between border-b px-4">
              <Brand />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar menú"
                className="grid size-8 place-items-center rounded-md hover:bg-secondary [&_svg]:size-5"
              >
                <X />
              </button>
            </div>
            <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
              <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
            </nav>
            <SidebarFooter userLabel={userLabel} />
          </aside>
        </div>
      )}

      <main className="overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</div>
      </main>
    </div>
  )
}
