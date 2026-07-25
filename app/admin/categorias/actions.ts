'use server'

import { revalidatePath } from 'next/cache'
import { action, ActionError } from '@/lib/auth/action'
import { prisma } from '@/lib/db'
import { categorySchema } from '@/lib/employees/schema'
import { createCategory, updateCategory, deleteCategory } from '@/lib/employees/categories'

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string }

function fail(e: unknown): ActionResult {
  if (e instanceof ActionError) return { ok: false, error: e.message }
  throw e
}

export const createCategoryAction = action(['ADMIN'], async (_ctx, raw: unknown): Promise<ActionResult> => {
  const parsed = categorySchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  try {
    const id = await createCategory(prisma, parsed.data)
    revalidatePath('/admin/categorias')
    return { ok: true, id }
  } catch (e) {
    return fail(e)
  }
})

export const updateCategoryAction = action(
  ['ADMIN'],
  async (_ctx, id: string, raw: unknown): Promise<ActionResult> => {
    const parsed = categorySchema.safeParse(raw)
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
    try {
      await updateCategory(prisma, id, parsed.data)
      revalidatePath('/admin/categorias')
      revalidatePath(`/admin/categorias/${id}`) // la pantalla de edición donde está el usuario
      return { ok: true, id }
    } catch (e) {
      return fail(e)
    }
  },
)

export const deleteCategoryAction = action(['ADMIN'], async (_ctx, id: string): Promise<ActionResult> => {
  try {
    await deleteCategory(prisma, id)
    revalidatePath('/admin/categorias')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
})
