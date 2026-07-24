import { describe, it, expect } from 'vitest'
import { decideAccess, roleHome, type AppRole } from './access'

const ROLES: AppRole[] = ['ADMIN', 'SUPERVISOR', 'EMPLOYEE']
const ROUTE_ROLE: Record<string, AppRole> = {
  '/admin': 'ADMIN',
  '/supervisor': 'SUPERVISOR',
  '/empleado': 'EMPLOYEE',
}

describe('decideAccess — matriz de roles', () => {
  it('sin sesión → redirect a /login en cualquier ruta', () => {
    for (const required of ROLES) {
      expect(decideAccess(null, [required])).toEqual({ ok: false, redirectTo: '/login' })
    }
  })

  it('cada rol entra SOLO a su propia shell', () => {
    for (const role of ROLES) {
      expect(decideAccess({ role }, [role])).toEqual({ ok: true })
    }
  })

  it('un rol NO entra a las rutas de los otros dos (lo mandan a su home)', () => {
    for (const role of ROLES) {
      const otras = ROLES.filter((r) => r !== role)
      for (const otra of otras) {
        const res = decideAccess({ role }, [otra])
        expect(res.ok).toBe(false)
        if (!res.ok) expect(res.redirectTo).toBe(roleHome(role))
      }
    }
  })

  it('roleHome mapea cada rol a su shell', () => {
    for (const [route, role] of Object.entries(ROUTE_ROLE)) {
      expect(roleHome(role)).toBe(route)
    }
  })
})
