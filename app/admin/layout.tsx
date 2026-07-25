import { requireRole } from '@/lib/auth/guard'
import { AdminShell } from '@/components/shell/admin-shell'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole(['ADMIN'])
  const userLabel = session.user.name ?? session.user.email

  return <AdminShell userLabel={userLabel}>{children}</AdminShell>
}
