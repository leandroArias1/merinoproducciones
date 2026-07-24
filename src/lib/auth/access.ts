/**
 * Decisión de acceso por rol. PURA (sin DB, sin Next): fácil de testear.
 */

export type AppRole = 'ADMIN' | 'SUPERVISOR' | 'EMPLOYEE'

/** Home de cada rol: adónde lo lleva el login y adónde se lo redirige si pisa una ruta ajena. */
export function roleHome(role: AppRole): string {
  switch (role) {
    case 'ADMIN':
      return '/admin'
    case 'SUPERVISOR':
      return '/supervisor'
    case 'EMPLOYEE':
      return '/empleado'
  }
}

export type Access = { ok: true } | { ok: false; redirectTo: string }

/**
 * Default DENEGAR: sin sesión -> /login. Con sesión pero rol no permitido ->
 * a su propio home (no a un 403 genérico). Cada página declara `allowed`.
 */
export function decideAccess(session: { role: AppRole } | null, allowed: AppRole[]): Access {
  if (!session) return { ok: false, redirectTo: '/login' }
  if (!allowed.includes(session.role)) return { ok: false, redirectTo: roleHome(session.role) }
  return { ok: true }
}
