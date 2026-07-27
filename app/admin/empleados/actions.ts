'use server'

import { revalidatePath } from 'next/cache'
import { action, ActionError } from '@/lib/auth/action'
import { prisma } from '@/lib/db'
import { employeeSchema } from '@/lib/employees/schema'
import { createEmployee, updateEmployee, softDeleteEmployee } from '@/lib/employees/employees'
import { buildImportPreview, commitImport, type ImportPreview, type ImportResult } from '@/lib/employees/import'
import { grantAccess, setUserRole, resetPassword, disableAccess } from '@/lib/users/access'
import type { AppRole } from '@/lib/auth/access'
import { generateBajaItem } from '@/lib/payroll/close'
import { todayKeyBA, workDateFromKey } from '@/lib/attendance/timezone'

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string }

function fail(e: unknown): ActionResult {
  if (e instanceof ActionError) return { ok: false, error: e.message }
  throw e
}

export const createEmployeeAction = action(['ADMIN'], async (ctx, raw: unknown): Promise<ActionResult> => {
  const parsed = employeeSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  try {
    const id = await createEmployee(prisma, parsed.data, ctx.actorId)
    revalidatePath('/admin/empleados')
    return { ok: true, id }
  } catch (e) {
    return fail(e)
  }
})

export const updateEmployeeAction = action(
  ['ADMIN'],
  async (ctx, id: string, raw: unknown): Promise<ActionResult> => {
    const parsed = employeeSchema.safeParse(raw)
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
    try {
      await updateEmployee(prisma, id, parsed.data, ctx.actorId)
      revalidatePath('/admin/empleados')
      revalidatePath(`/admin/empleados/${id}`)
      return { ok: true, id }
    } catch (e) {
      return fail(e)
    }
  },
)

export const deleteEmployeeAction = action(['ADMIN'], async (ctx, id: string): Promise<ActionResult> => {
  try {
    await softDeleteEmployee(prisma, id, ctx.actorId)
    // Baja a mitad de mes: se genera y cierra su liquidación proporcional AHORA
    // (cobra en el momento). Best-effort: la baja ya está hecha; si esto falla,
    // el cierre de fin de mes lo levanta igual (el roster incluye al dado de baja).
    try {
      await generateBajaItem(prisma, id, workDateFromKey(todayKeyBA(new Date())), ctx.actorId)
    } catch (bajaErr) {
      console.error('generateBajaItem falló (la baja se hizo igual):', bajaErr)
    }
    revalidatePath('/admin/empleados')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
})

// ── Importador CSV ──

export type PreviewResult = { ok: true; preview: ImportPreview } | { ok: false; error: string }

export const previewImportAction = action(['ADMIN'], async (_ctx, csvText: string): Promise<PreviewResult> => {
  if (!csvText.trim()) return { ok: false, error: 'Pegá o subí un CSV.' }
  try {
    const preview = await buildImportPreview(prisma, csvText)
    return { ok: true, preview }
  } catch (e) {
    if (e instanceof ActionError) return { ok: false, error: e.message }
    throw e
  }
})

export type CommitResult = { ok: true; result: ImportResult } | { ok: false; error: string }

export const commitImportAction = action(['ADMIN'], async (ctx, csvText: string): Promise<CommitResult> => {
  try {
    // Re-valida server-side y crea por lotes (todo o nada a nivel usuario).
    const result = await commitImport(prisma, csvText, ctx.actorId)
    revalidatePath('/admin/empleados')
    return { ok: true, result }
  } catch (e) {
    if (e instanceof ActionError) return { ok: false, error: e.message }
    // El import NUNCA puede fallar en silencio (era el bug #1): cualquier error
    // inesperado se devuelve como mensaje, no se re-lanza a la boundary de Next.
    const detail = e instanceof Error ? e.message : String(e)
    return { ok: false, error: `No se pudo importar (error inesperado): ${detail}` }
  }
})

// ── Gestión de acceso (login) del empleado ──

const ROLES: AppRole[] = ['ADMIN', 'SUPERVISOR', 'EMPLOYEE']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateEmail(email: string): string | null {
  return EMAIL_RE.test(email.trim()) ? null : 'Email inválido.'
}
function validatePassword(pw: string): string | null {
  return pw.length >= 8 ? null : 'La contraseña debe tener al menos 8 caracteres.'
}
function validateRole(role: string): string | null {
  return ROLES.includes(role as AppRole) ? null : 'Rol inválido.'
}

export const grantAccessAction = action(
  ['ADMIN'],
  async (ctx, employeeId: string, email: string, password: string, role: string): Promise<ActionResult> => {
    const err = validateEmail(email) ?? validatePassword(password) ?? validateRole(role)
    if (err) return { ok: false, error: err }
    try {
      await grantAccess(prisma, { employeeId, email, password, role: role as AppRole }, ctx.actorId)
      revalidatePath(`/admin/empleados/${employeeId}`)
      return { ok: true }
    } catch (e) {
      if (e instanceof ActionError) return { ok: false, error: e.message }
      return { ok: false, error: `No se pudo crear el acceso: ${e instanceof Error ? e.message : String(e)}` }
    }
  },
)

/**
 * Cambia el rol de la cuenta de acceso. La usan los DOS lugares desde donde se
 * edita el rol: el panel "Acceso a la app" del legajo y el form de "Editar
 * empleado" — una sola operación, dos puntos de entrada.
 *
 * Por eso revalida las dos pantallas: revalidar solo el legajo dejaba a
 * "Editar" mostrando el rol viejo al volver. Mismo bug de pantalla vieja que
 * ya nos pasó en caja y en liquidaciones.
 */
export const setUserRoleAction = action(
  ['ADMIN'],
  async (ctx, employeeId: string, role: string): Promise<ActionResult> => {
    const err = validateRole(role)
    if (err) return { ok: false, error: err }
    try {
      await setUserRole(prisma, employeeId, role as AppRole, ctx.actorId)
      revalidatePath(`/admin/empleados/${employeeId}`)
      revalidatePath(`/admin/empleados/${employeeId}/editar`)
      return { ok: true }
    } catch (e) {
      if (e instanceof ActionError) return { ok: false, error: e.message }
      throw e
    }
  },
)

export const resetPasswordAction = action(
  ['ADMIN'],
  async (ctx, employeeId: string, password: string): Promise<ActionResult> => {
    const err = validatePassword(password)
    if (err) return { ok: false, error: err }
    try {
      await resetPassword(prisma, employeeId, password, ctx.actorId)
      revalidatePath(`/admin/empleados/${employeeId}`)
      return { ok: true }
    } catch (e) {
      if (e instanceof ActionError) return { ok: false, error: e.message }
      throw e
    }
  },
)

export const disableAccessAction = action(['ADMIN'], async (ctx, employeeId: string): Promise<ActionResult> => {
  try {
    await disableAccess(prisma, employeeId, ctx.actorId)
    revalidatePath(`/admin/empleados/${employeeId}`)
    return { ok: true }
  } catch (e) {
    if (e instanceof ActionError) return { ok: false, error: e.message }
    throw e
  }
})
