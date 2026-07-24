import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import type { AppRole } from './access'

export interface AppSessionUser {
  id: string
  email: string
  name: string | null
  role: AppRole
}

export interface AppEmployee {
  id: string
  firstName: string
  lastName: string
}

export interface AppSession {
  user: AppSessionUser
  role: AppRole
  employee: AppEmployee | null
}

/**
 * Sesión enriquecida server-side: user + role + empleado vinculado.
 *
 * Recibe los `headers` explícitos (testeable). El empleado se busca con
 * findFirst({ userId, deletedAt: null }) — NUNCA findUnique: el unique de
 * userId es PARCIAL en la DB, y un findUnique podría devolver el legajo viejo
 * de alguien dado de baja y re-contratado con la misma cuenta.
 */
export async function getAppSession(reqHeaders: Headers): Promise<AppSession | null> {
  const session = await auth.api.getSession({ headers: reqHeaders })
  if (!session) return null

  const role = (session.user as { role?: AppRole }).role ?? 'EMPLOYEE'

  const employee = await prisma.employee.findFirst({
    where: { userId: session.user.id, deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
  })

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name ?? null,
      role,
    },
    role,
    employee,
  }
}
