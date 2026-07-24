'use server'

import { revalidatePath } from 'next/cache'
import { action, ActionError } from '@/lib/auth/action'
import { prisma } from '@/lib/db'
import { clockIn, clockOut, type LocationInput } from '@/lib/timeentry/fichaje'

export type ActionResult = { ok: true } | { ok: false; error: string }

function fail(e: unknown): ActionResult {
  if (e instanceof ActionError) return { ok: false, error: e.message }
  throw e
}

export const clockInAction = action(['EMPLOYEE'], async (ctx, location: LocationInput): Promise<ActionResult> => {
  const employeeId = ctx.session.employee?.id
  if (!employeeId) return { ok: false, error: 'Tu usuario no está vinculado a un legajo.' }
  try {
    // La hora la pone el SERVIDOR (new Date()), nunca el cliente.
    await clockIn(prisma, { employeeId, actorId: ctx.actorId, source: 'DEVICE', location }, new Date())
    revalidatePath('/empleado')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
})

export const clockOutAction = action(['EMPLOYEE'], async (ctx, location: LocationInput): Promise<ActionResult> => {
  const employeeId = ctx.session.employee?.id
  if (!employeeId) return { ok: false, error: 'Tu usuario no está vinculado a un legajo.' }
  try {
    await clockOut(prisma, { employeeId, actorId: ctx.actorId, location }, new Date())
    revalidatePath('/empleado')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
})
