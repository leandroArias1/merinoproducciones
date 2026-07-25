import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { createEmployee } from '@/lib/employees/employees'
import { grantAccess, setUserRole, resetPassword, disableAccess, getEmployeeAccess } from '@/lib/users/access'
import { getAppSession } from '@/lib/auth/session'
import { decideAccess } from '@/lib/auth/access'

const ACTOR = 'admin-user-id'

async function clean() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "user", account, session, employee_category, category_day, employee, work_schedule, attendance, audit_log, event_assignment, time_entry, leave_request, event, holiday RESTART IDENTITY CASCADE',
  )
}

async function makeEmployee(documentId = '40100100') {
  return createEmployee(
    prisma,
    { firstName: 'Ana', lastName: 'Test', documentId, email: '', phone: '', position: '', employmentType: 'MONTHLY', hireDate: '', categoryId: '', active: true },
    ACTOR,
  )
}

async function canSignIn(email: string, password: string): Promise<boolean> {
  try {
    const res = await auth.api.signInEmail({ body: { email, password } })
    return Boolean(res)
  } catch {
    return false
  }
}

beforeEach(async () => {
  await clean()
  await prisma.user.create({ data: { id: ACTOR, email: 'admin@t.com', name: 'Admin', role: 'ADMIN' } })
})
afterAll(async () => {
  await prisma.$disconnect()
})

/** Resuelve el rol de la sesión REAL tras loguear (lo mismo que usa requireRole). */
async function sessionRoleAfterSignIn(email: string, password: string): Promise<string | null> {
  const res = await auth.api.signInEmail({ body: { email, password }, asResponse: true })
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
  const session = await getAppSession(new Headers({ cookie }))
  return session?.role ?? null
}

describe('gestión de acceso del empleado', () => {
  it('SEGUNDO admin: coexiste con el primero, loguea, y su SESIÓN resuelve a ADMIN (ve todo)', async () => {
    // ACTOR ya es ADMIN. Creo dos empleados y les doy acceso ADMIN a ambos.
    const emp1 = await makeEmployee('40100201')
    const emp2 = await makeEmployee('40100202')
    await grantAccess(prisma, { employeeId: emp1, email: 'admin.uno@e.com', password: 'AdminUno1', role: 'ADMIN' }, ACTOR)
    await grantAccess(prisma, { employeeId: emp2, email: 'admin.dos@e.com', password: 'AdminDos2', role: 'ADMIN' }, ACTOR)

    // Sin límite de admins: coexisten (ACTOR + los 2 nuevos → ≥ 3).
    expect(await prisma.user.count({ where: { role: 'ADMIN' } })).toBeGreaterThanOrEqual(3)

    // Los dos nuevos loguean.
    expect(await canSignIn('admin.uno@e.com', 'AdminUno1')).toBe(true)
    expect(await canSignIn('admin.dos@e.com', 'AdminDos2')).toBe(true)

    // El 2º admin: su sesión REAL resuelve a rol ADMIN → requireRole(['ADMIN']) lo deja
    // entrar a TODO (sueldos, caja, gestión de usuarios usan el mismo guard).
    expect(await sessionRoleAfterSignIn('admin.dos@e.com', 'AdminDos2')).toBe('ADMIN')
    expect(decideAccess({ role: 'ADMIN' }, ['ADMIN']).ok).toBe(true)
  })

  it('crear acceso SUPERVISOR: vincula, setea rol, y el empleado puede loguearse', async () => {
    const empId = await makeEmployee()
    const email = 'ana.super@empresa.com'
    await grantAccess(prisma, { employeeId: empId, email, password: 'ClaveSegura1', role: 'SUPERVISOR' }, ACTOR)

    const acc = await getEmployeeAccess(prisma, empId)
    expect(acc.hasUser).toBe(true)
    expect(acc.active).toBe(true)
    expect(acc.role).toBe('SUPERVISOR')
    expect(acc.email).toBe(email)

    // employee.userId quedó vinculado
    const emp = await prisma.employee.findFirstOrThrow({ where: { id: empId }, select: { userId: true } })
    expect(emp.userId).toBe(acc.userId)

    // Puede loguearse con la credencial creada por Better Auth
    expect(await canSignIn(email, 'ClaveSegura1')).toBe(true)

    // Auditado
    const audits = await prisma.auditLog.count({ where: { domain: 'USER', action: 'grant-access' } })
    expect(audits).toBe(1)
  })

  it('no se puede crear acceso dos veces (ya tiene credencial)', async () => {
    const empId = await makeEmployee()
    await grantAccess(prisma, { employeeId: empId, email: 'a@e.com', password: 'ClaveSegura1', role: 'EMPLOYEE' }, ACTOR)
    await expect(
      grantAccess(prisma, { employeeId: empId, email: 'a@e.com', password: 'ClaveSegura1', role: 'EMPLOYEE' }, ACTOR),
    ).rejects.toThrow(/ya tiene acceso/i)
  })

  it('cambiar rol actualiza el User y audita', async () => {
    const empId = await makeEmployee()
    await grantAccess(prisma, { employeeId: empId, email: 'a@e.com', password: 'ClaveSegura1', role: 'EMPLOYEE' }, ACTOR)
    await setUserRole(prisma, empId, 'ADMIN', ACTOR)
    const acc = await getEmployeeAccess(prisma, empId)
    expect(acc.role).toBe('ADMIN')
    expect(await prisma.auditLog.count({ where: { domain: 'USER', action: 'set-role' } })).toBe(1)
  })

  it('desactivar acceso: no puede loguearse, pero el User se conserva; re-habilitar funciona', async () => {
    const empId = await makeEmployee()
    const email = 'a@e.com'
    await grantAccess(prisma, { employeeId: empId, email, password: 'ClaveSegura1', role: 'SUPERVISOR' }, ACTOR)
    const userId = (await getEmployeeAccess(prisma, empId)).userId

    await disableAccess(prisma, empId, ACTOR)
    const acc = await getEmployeeAccess(prisma, empId)
    expect(acc.hasUser).toBe(true) // el User NO se borra
    expect(acc.active).toBe(false) // pero no puede loguearse
    expect(acc.userId).toBe(userId) // MISMO user (actorId de audit intacto)
    expect(await canSignIn(email, 'ClaveSegura1')).toBe(false)

    // Re-habilitar: grantAccess sobre el mismo empleado recrea la credencial.
    await grantAccess(prisma, { employeeId: empId, email, password: 'OtraClave2', role: 'SUPERVISOR' }, ACTOR)
    const acc2 = await getEmployeeAccess(prisma, empId)
    expect(acc2.active).toBe(true)
    expect(acc2.userId).toBe(userId) // se reusa el mismo User
    expect(await canSignIn(email, 'OtraClave2')).toBe(true)
  })

  it('restablecer contraseña: la vieja deja de servir, la nueva sirve', async () => {
    const empId = await makeEmployee()
    const email = 'a@e.com'
    await grantAccess(prisma, { employeeId: empId, email, password: 'ClaveVieja1', role: 'EMPLOYEE' }, ACTOR)
    await resetPassword(prisma, empId, 'ClaveNueva2', ACTOR)
    expect(await canSignIn(email, 'ClaveVieja1')).toBe(false)
    expect(await canSignIn(email, 'ClaveNueva2')).toBe(true)
  })
})
