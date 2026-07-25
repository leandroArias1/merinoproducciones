import { randomUUID } from 'node:crypto'
import { hashPassword } from 'better-auth/crypto'
import { Prisma } from '@/generated/prisma/client'
import type { PrismaClient } from '@/generated/prisma/client'
import { auth } from '@/lib/auth'
import { ActionError } from '@/lib/auth/action'
import type { AppRole } from '@/lib/auth/access'

/**
 * Gestión de acceso (login) de un empleado — lo que el seed-test-users hacía por
 * atrás, ahora expuesto para la UI del admin. Reglas:
 *  - La credencial (hash del password) la crea SIEMPRE Better Auth: para altas
 *    nuevas via `auth.api.signUpEmail`; para recrearla (re-habilitar) via el
 *    `hashPassword` de `better-auth/crypto` (mismo algoritmo). Nunca a mano.
 *  - NUNCA se borra la fila User (rompería el actorId de AuditLog). "Desactivar
 *    acceso" = borrar la credencial + revocar sesiones; el User se conserva.
 *  - Todo pasa por action(['ADMIN']) y queda auditado (domain 'USER').
 */

type Db = PrismaClient

export interface EmployeeAccess {
  hasUser: boolean
  userId: string | null
  email: string | null
  role: AppRole | null
  /** true = puede loguearse (tiene credencial). false = User sin credencial (desactivado). */
  active: boolean
}

/** Estado de acceso de un empleado, para pintar el panel del admin. */
export async function getEmployeeAccess(db: Db, employeeId: string): Promise<EmployeeAccess> {
  const emp = await db.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
    select: { userId: true, user: { select: { id: true, email: true, role: true } } },
  })
  if (!emp?.user) return { hasUser: false, userId: null, email: null, role: null, active: false }

  const cred = await db.account.findFirst({
    where: { userId: emp.user.id, providerId: 'credential' },
    select: { id: true },
  })
  return {
    hasUser: true,
    userId: emp.user.id,
    email: emp.user.email,
    role: emp.user.role as AppRole,
    active: cred !== null,
  }
}

async function writeUserAudit(
  db: Db,
  args: { action: string; userId: string; actorId: string; before: unknown; after: unknown },
): Promise<void> {
  await db.auditLog.create({
    data: {
      domain: 'USER',
      action: args.action,
      entityType: 'User',
      entityId: args.userId,
      before: args.before === null ? Prisma.DbNull : (args.before as Prisma.InputJsonValue),
      after: args.after === null ? Prisma.DbNull : (args.after as Prisma.InputJsonValue),
      actorId: args.actorId,
    },
  })
}

/** (Re)crea la credencial email+password de un User con el hasher de Better Auth. */
async function setCredential(db: Db, userId: string, plainPassword: string): Promise<void> {
  const password = await hashPassword(plainPassword)
  await db.account.deleteMany({ where: { userId, providerId: 'credential' } })
  await db.account.create({
    data: {
      id: randomUUID(),
      accountId: userId,
      providerId: 'credential',
      userId,
      password,
    },
  })
}

export interface GrantAccessInput {
  employeeId: string
  email: string
  password: string
  role: AppRole
}

/**
 * Crea (o re-habilita) el acceso de un empleado. Si el empleado ya tiene User
 * vinculado sin credencial (fue desactivado), le recrea la credencial y ajusta
 * el rol. Si no tiene User, lo crea con Better Auth y lo vincula.
 */
export async function grantAccess(db: Db, input: GrantAccessInput, actorId: string): Promise<string> {
  const emp = await db.employee.findFirst({
    where: { id: input.employeeId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, userId: true },
  })
  if (!emp) throw new ActionError('NOT_FOUND', 'Empleado no encontrado.')

  // ── Caso re-habilitar: ya hay User vinculado ──
  if (emp.userId) {
    const cred = await db.account.findFirst({
      where: { userId: emp.userId, providerId: 'credential' },
      select: { id: true },
    })
    if (cred) {
      throw new ActionError('CONFLICT', 'Este empleado ya tiene acceso. Usá "Restablecer contraseña" o "Cambiar rol".')
    }
    await setCredential(db, emp.userId, input.password)
    await db.user.update({ where: { id: emp.userId }, data: { role: input.role, emailVerified: true } })
    await writeUserAudit(db, { action: 'grant-access', userId: emp.userId, actorId, before: null, after: { role: input.role, reenabled: true } })
    return emp.userId
  }

  // ── Caso alta nueva: no hay User ──
  const email = input.email.trim().toLowerCase()
  // User.email es unique TOTAL en la DB.
  const taken = await db.user.findUnique({ where: { email }, select: { id: true } })
  if (taken) throw new ActionError('CONFLICT', `Ya existe un usuario con el email ${email}.`)

  // La credencial la crea Better Auth (respeta la regla de CLAUDE.md).
  await auth.api.signUpEmail({
    body: { email, password: input.password, name: `${emp.firstName} ${emp.lastName}` },
  })
  const user = await db.user.findUniqueOrThrow({ where: { email }, select: { id: true } })

  await db.user.update({ where: { id: user.id }, data: { role: input.role, emailVerified: true } })
  await db.employee.update({ where: { id: emp.id }, data: { userId: user.id } })
  await writeUserAudit(db, { action: 'grant-access', userId: user.id, actorId, before: null, after: { email, role: input.role } })
  return user.id
}

/** Cambia el rol del User vinculado a un empleado. Auditado. */
export async function setUserRole(db: Db, employeeId: string, role: AppRole, actorId: string): Promise<void> {
  const emp = await db.employee.findFirst({ where: { id: employeeId, deletedAt: null }, select: { userId: true } })
  if (!emp?.userId) throw new ActionError('NOT_FOUND', 'El empleado no tiene un acceso vinculado.')
  const user = await db.user.findUniqueOrThrow({ where: { id: emp.userId }, select: { role: true } })
  if (user.role === role) return
  await db.user.update({ where: { id: emp.userId }, data: { role } })
  await writeUserAudit(db, { action: 'set-role', userId: emp.userId, actorId, before: { role: user.role }, after: { role } })
}

/** Restablece la contraseña del acceso (admin la define / genera una temporal). */
export async function resetPassword(db: Db, employeeId: string, newPassword: string, actorId: string): Promise<void> {
  const emp = await db.employee.findFirst({ where: { id: employeeId, deletedAt: null }, select: { userId: true } })
  if (!emp?.userId) throw new ActionError('NOT_FOUND', 'El empleado no tiene un acceso vinculado.')
  await setCredential(db, emp.userId, newPassword)
  await writeUserAudit(db, { action: 'reset-password', userId: emp.userId, actorId, before: null, after: { reset: true } })
}

/**
 * Desactiva el acceso: borra la credencial (no puede loguearse) y revoca todas
 * las sesiones. NUNCA borra la fila User (conserva el actorId de AuditLog).
 */
export async function disableAccess(db: Db, employeeId: string, actorId: string): Promise<void> {
  const emp = await db.employee.findFirst({ where: { id: employeeId, deletedAt: null }, select: { userId: true } })
  if (!emp?.userId) throw new ActionError('NOT_FOUND', 'El empleado no tiene un acceso vinculado.')
  await db.account.deleteMany({ where: { userId: emp.userId, providerId: 'credential' } })
  await db.session.deleteMany({ where: { userId: emp.userId } })
  await writeUserAudit(db, { action: 'disable-access', userId: emp.userId, actorId, before: null, after: { disabled: true } })
}
