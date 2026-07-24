'use server'

import { revalidatePath } from 'next/cache'
import { action, ActionError } from '@/lib/auth/action'
import { prisma } from '@/lib/db'
import { employeeSchema } from '@/lib/employees/schema'
import { createEmployee, updateEmployee, softDeleteEmployee } from '@/lib/employees/employees'
import { buildImportPreview, commitImport, type ImportPreview, type ImportResult } from '@/lib/employees/import'

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
    // Re-valida server-side y crea en una sola transacción (todo o nada).
    const result = await commitImport(prisma, csvText, ctx.actorId)
    revalidatePath('/admin/empleados')
    return { ok: true, result }
  } catch (e) {
    if (e instanceof ActionError) return { ok: false, error: e.message }
    throw e
  }
})
