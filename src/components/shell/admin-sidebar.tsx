'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, Tags, CalendarDays, ClipboardCheck, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LogoutButton } from './logout-button'

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/empleados', label: 'Empleados', icon: Users },
  { href: '/admin/categorias', label: 'Categorías', icon: Tags },
  { href: '/admin/eventos', label: 'Eventos', icon: CalendarDays },
  { href: '/admin/asistencia', label: 'Asistencia', icon: ClipboardCheck },
  { href: '/admin/reportes', label: 'Reportes', icon: BarChart3 },
] as const

export function AdminSidebar({ userLabel }: { userLabel: string }) {
  const pathname = usePathname()
  return (
    <aside className="flex w-60 flex-col border-r bg-background">
      <div className="flex h-12 items-center border-b px-4">
        <span className="text-sm font-semibold tracking-tight">
          PRO<span className="text-primary">FORMA</span>
        </span>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === '/admin' ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
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
      </nav>

      <div className="flex items-center justify-between border-t p-3">
        <span className="truncate text-xs text-muted-foreground" title={userLabel}>
          {userLabel}
        </span>
        <LogoutButton />
      </div>
    </aside>
  )
}
