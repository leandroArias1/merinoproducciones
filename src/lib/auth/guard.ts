import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { decideAccess, type AppRole } from './access'
import { getAppSession, type AppSession } from './session'

/**
 * Guard de rol para Server Components. Default DENEGAR: cada layout/página
 * declara explícitamente qué roles admite. Si no cumple, redirige (a /login
 * sin sesión, o al home del rol si es una ruta ajena) y corta el render.
 *
 * Devuelve la sesión ya validada para usar en la página.
 */
export async function requireRole(allowed: AppRole[]): Promise<AppSession> {
  const session = await getAppSession(await headers())
  const access = decideAccess(session, allowed)
  if (!access.ok) redirect(access.redirectTo)
  return session as AppSession
}

/** Sesión actual sin exigir rol (para la raíz que redirige por rol). */
export async function currentSession(): Promise<AppSession | null> {
  return getAppSession(await headers())
}
