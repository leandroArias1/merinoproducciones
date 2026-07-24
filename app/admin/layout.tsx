import { requireRole } from '@/lib/auth/guard'
import { AdminSidebar } from '@/components/shell/admin-sidebar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole(['ADMIN'])
  const userLabel = session.user.name ?? session.user.email

  return (
    <div className="grid min-h-[100dvh] grid-cols-[15rem_1fr]">
      <AdminSidebar userLabel={userLabel} />
      <main className="overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
      </main>
    </div>
  )
}
