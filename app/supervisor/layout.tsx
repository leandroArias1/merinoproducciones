import { requireRole } from '@/lib/auth/guard'
import { SupervisorNav } from '@/components/shell/supervisor-nav'
import { LogoutButton } from '@/components/shell/logout-button'

export default async function SupervisorLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole(['SUPERVISOR'])
  const userLabel = session.user.name ?? session.user.email

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col">
      <header className="flex h-12 items-center justify-between border-b px-4">
        <span className="text-sm font-semibold tracking-tight">
          Merino <span className="text-primary">Producciones</span>
          <span className="ml-2 text-xs font-normal text-muted-foreground">Supervisor</span>
        </span>
        <div className="flex items-center gap-3">
          <span className="max-w-[9rem] truncate text-xs text-muted-foreground">{userLabel}</span>
          <LogoutButton />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6">{children}</main>
      <SupervisorNav />
    </div>
  )
}
