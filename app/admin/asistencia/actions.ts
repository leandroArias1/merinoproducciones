'use server'

import { revalidatePath } from 'next/cache'
import { action, ActionError } from '@/lib/auth/action'
import { prisma } from '@/lib/db'
import {
  adminEditTimeEntry,
  adminDeleteTimeEntry,
  adminSetManualStatus,
  adminRecalcDay,
} from '@/lib/timeentry/fichaje'
import { baLocalToInstant } from '@/lib/events/time'
import { workDateFromKey } from '@/lib/attendance/timezone'

export type ActionResult = { ok: true } | { ok: false; error: string }

function fail(e: unknown): ActionResult {
  if (e instanceof ActionError) return { ok: false, error: e.message }
  throw e
}

/** Tocar una fichada/status cambia la tabla del día, los días a revisar y el
 *  contador del dashboard: una sola llamada con alcance 'layout' los cubre. */
function revalidateAsistencia(): void {
  revalidatePath('/admin', 'layout')
}

export const editEntryAction = action(
  ['ADMIN'],
  async (ctx, id: string, checkInLocal: string, checkOutLocal: string): Promise<ActionResult> => {
    if (!checkInLocal) return { ok: false, error: 'La entrada es obligatoria.' }
    try {
      await adminEditTimeEntry(
        prisma,
        id,
        { checkIn: baLocalToInstant(checkInLocal), checkOut: checkOutLocal ? baLocalToInstant(checkOutLocal) : null },
        ctx.actorId,
      )
      revalidateAsistencia()
      return { ok: true }
    } catch (e) {
      return fail(e)
    }
  },
)

export const deleteEntryAction = action(['ADMIN'], async (ctx, id: string): Promise<ActionResult> => {
  try {
    await adminDeleteTimeEntry(prisma, id, ctx.actorId)
    revalidateAsistencia()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
})

export const markJustifiedAction = action(
  ['ADMIN'],
  async (ctx, employeeId: string, workDateKey: string): Promise<ActionResult> => {
    try {
      await adminSetManualStatus(prisma, {
        employeeId,
        workDate: workDateFromKey(workDateKey),
        status: 'JUSTIFIED',
        actorId: ctx.actorId,
      })
      revalidateAsistencia()
      return { ok: true }
    } catch (e) {
      return fail(e)
    }
  },
)

export const recalcDayAction = action(
  ['ADMIN'],
  async (ctx, employeeId: string, workDateKey: string): Promise<ActionResult> => {
    try {
      await adminRecalcDay(prisma, employeeId, workDateFromKey(workDateKey), ctx.actorId)
      revalidateAsistencia()
      return { ok: true }
    } catch (e) {
      return fail(e)
    }
  },
)
