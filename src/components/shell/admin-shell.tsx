'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, Home, Users, Clock, CalendarDays, ClipboardCheck, Wallet, Coins, Contact, Truck, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LogoutButton } from './logout-button'

/**
 * Navegación agrupada por la PREGUNTA que contesta cada sección, no por cómo
 * está construido el sistema. Los nombres son los del negocio: el dueño dice
 * "sueldos" y "horarios", no "liquidaciones" y "categorías".
 *
 * Las rutas NO cambian (igual que en el rebrand): esto es sólo etiqueta y
 * agrupación. Los grupos chicos mantienen cada bloque escaneable de un vistazo
 * aunque la lista total pase de siete ítems.
 *
 * "Clientes" y "Proveedores" son las agendas: ya existen como pantallas
 * propias, separadas de las cuentas por cobrar/pagar que viven bajo Caja.
 */
const NAV = [
  { title: null, items: [{ href: '/admin', label: 'Hoy', icon: Home }] },
  {
    title: 'Personal',
    items: [
      { href: '/admin/empleados', label: 'Empleados', icon: Users },
      { href: '/admin/asistencia', label: 'Asistencia', icon: ClipboardCheck },
      { href: '/admin/liquidaciones', label: 'Sueldos', icon: Wallet },
      { href: '/admin/categorias', label: 'Horarios', icon: Clock },
    ],
  },
  { title: 'Trabajo', items: [{ href: '/admin/eventos', label: 'Eventos', icon: CalendarDays }] },
  {
    title: 'Dinero',
    items: [
      { href: '/admin/caja', label: 'Caja', icon: Coins },
      { href: '/admin/clientes', label: 'Clientes', icon: Contact },
      { href: '/admin/proveedores', label: 'Proveedores', icon: Truck },
      { href: '/admin/reportes', label: 'Reportes', icon: BarChart3 },
    ],
  },
] as const

/** El wordmark es largo: `truncate` es la red por si el sidebar se angosta. */
function Brand() {
  return (
    <span className="truncate text-sm font-semibold tracking-tight" title="Merino Producciones">
      Merino <span className="text-primary">Producciones</span>
    </span>
  )
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      {NAV.map((group) => (
        <div key={group.title ?? 'inicio'} className="flex flex-col gap-px">
          {group.title && (
            <span className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {group.title}
            </span>
          )}
          {group.items.map(({ href, label, icon: Icon }) => {
            const active = href === '/admin' ? pathname === href : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                // Sin prefetch: los links están en viewport en desktop, así que
                // Next ejecutaba cada página entera (queries + sesión) al montar
                // el shell. Medido: con 8 pedidos en paralelo cada uno pasa de
                // ~1 s a 2,5-3,4 s por contención. La navegación sigue siendo
                // del lado del cliente.
                prefetch={false}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-sm transition-colors [&_svg]:size-4 [&_svg]:shrink-0',
                  active
                    ? // El activo se marca por fondo Y barra lateral: no depende sólo del color.
                      'bg-primary-tint font-semibold text-primary shadow-[inset_2px_0_0_var(--primary)]'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                <Icon strokeWidth={2} />
                <span className="truncate">{label}</span>
              </Link>
            )
          })}
        </div>
      ))}
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
      {/* Sidebar fijo (desktop). Fondo `paper` contra el contenido en `surface`:
          la separación la hace la superficie, no una sombra. */}
      <aside className="hidden border-r bg-paper md:flex md:flex-col">
        <div className="flex h-12 items-center border-b px-4">
          <Brand />
        </div>
        {/* gap-3.5 entre grupos vs gap-px dentro: la proximidad agrupa. */}
        <nav className="flex flex-1 flex-col gap-3.5 overflow-y-auto p-2 pt-3">
          <NavLinks pathname={pathname} />
        </nav>
        <SidebarFooter userLabel={userLabel} />
      </aside>

      {/* Header mobile con hamburguesa */}
      <header className="flex h-12 items-center gap-3 border-b bg-paper px-3 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
          className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-secondary [&_svg]:size-5"
        >
          <Menu />
        </button>
        <Brand />
      </header>

      {/* Drawer mobile */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r bg-paper shadow-xl">
            <div className="flex h-12 items-center justify-between gap-2 border-b px-4">
              <Brand />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar menú"
                className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-secondary [&_svg]:size-5"
              >
                <X />
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-3.5 overflow-y-auto p-2 pt-3">
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
