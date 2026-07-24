import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/auth/guard'
import { roleHome } from '@/lib/auth/access'

// La raíz no tiene contenido: manda a cada rol a su shell.
export default async function Home() {
  const session = await currentSession()
  if (!session) redirect('/login')
  redirect(roleHome(session.role))
}
