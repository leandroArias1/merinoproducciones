'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarClock, CalendarDays, ClipboardCheck, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

// Sin sueldos, caja ni ganancias: el supervisor no accede a plata.
const NAV = [
  { href: '/supervisor', label: 'Hoy', icon: CalendarClock },
  { href: '/supervisor/eventos', label: 'Eventos', icon: CalendarDays },
  { href: '/supervisor/asistencia', label: 'Asistencia', icon: ClipboardCheck },
  { href: '/supervisor/equipo', label: 'Equipo', icon: Users },
] as const

export function SupervisorNav() {
  const pathname = usePathname()
  return (
    <nav className="sticky bottom-0 z-10 grid grid-cols-4 border-t bg-background">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === '/supervisor' ? pathname === href : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex flex-col items-center gap-1 py-2.5 text-xs transition-colors [&_svg]:size-5',
              active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon strokeWidth={2} />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
