import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { getAppSession } from '@/lib/auth/session'

/**
 * Integración del helper de sesión server-side (pnpm test:int, toca Postgres +
 * Better Auth).
 */

const EMAIL = 'sesion@test.com'
const PASSWORD = 'Password.2026'

async function clean() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "user", account, session, verification, employee, attendance, audit_log, event_assignment, time_entry, work_schedule, leave_request, event, holiday RESTART IDENTITY CASCADE',
  )
}

/** Crea el user con credencial, le fija el rol y devuelve headers con la cookie de sesión. */
async function signInAs(role: 'ADMIN' | 'SUPERVISOR' | 'EMPLOYEE') {
  await auth.api.signUpEmail({ body: { email: EMAIL, password: PASSWORD, name: 'Test User' } })
  const user = await prisma.user.update({
    where: { email: EMAIL },
    data: { role, emailVerified: true },
    select: { id: true },
  })
  const res = await auth.api.signInEmail({ body: { email: EMAIL, password: PASSWORD }, asResponse: true })
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
  return { userId: user.id, headers: new Headers({ cookie }) }
}

beforeEach(async () => {
  await clean()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('getAppSession', () => {
  it('sin cookie de sesión → null', async () => {
    const s = await getAppSession(new Headers())
    expect(s).toBeNull()
  })

  it('devuelve user + role + empleado vinculado', async () => {
    const { userId, headers } = await signInAs('SUPERVISOR')
    await prisma.employee.create({
      data: { firstName: 'Nahuel', lastName: 'Benítez', documentId: 'D-1', userId, active: true },
    })

    const s = await getAppSession(headers)
    expect(s).not.toBeNull()
    expect(s!.role).toBe('SUPERVISOR')
    expect(s!.user.email).toBe(EMAIL)
    expect(s!.employee?.firstName).toBe('Nahuel')
  })

  it('usa findFirst(deletedAt:null): con un legajo viejo soft-deleteado y uno nuevo activo en la misma cuenta, carga el ACTIVO', async () => {
    const { userId, headers } = await signInAs('EMPLOYEE')

    // Legajo viejo, dado de baja (soft delete) — el unique parcial lo permite.
    await prisma.employee.create({
      data: {
        firstName: 'Viejo',
        lastName: 'Legajo',
        documentId: 'D-OLD',
        userId,
        active: false,
        deletedAt: new Date('2025-01-01T00:00:00Z'),
      },
    })
    // Re-contratado con la misma cuenta: legajo nuevo, activo.
    await prisma.employee.create({
      data: { firstName: 'Nuevo', lastName: 'Legajo', documentId: 'D-NEW', userId, active: true },
    })

    const s = await getAppSession(headers)
    // Un findUnique por userId podría devolver el legajo viejo; findFirst con
    // deletedAt:null garantiza el activo.
    expect(s!.employee?.firstName).toBe('Nuevo')
  })
})
