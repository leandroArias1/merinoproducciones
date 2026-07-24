'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { cn } from '@/lib/utils'

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter()
  async function logout() {
    await authClient.signOut()
    router.push('/login')
    router.refresh()
  }
  return (
    <button
      onClick={logout}
      className={cn(
        'inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground [&_svg]:size-4',
        className,
      )}
    >
      <LogOut />
      Salir
    </button>
  )
}
