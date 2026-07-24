'use server'

import { revalidatePath } from 'next/cache'
import { action, ActionError } from '@/lib/auth/action'
import { prisma } from '@/lib/db'
import { setAssignmentStatus } from '@/lib/events/assignments'
import type { AssignmentStatus } from '@/lib/events/schema'
import { supervisorToggle, supervisorRetroactive, type LocationInput } from '@/lib/timeentry/fichaje'
import { baLocalToInstant } from '@/lib/events/time'

export type ActionResult = { ok: true } | { ok: false; error: string }

/**
 * El supervisor solo puede cambiar el status de SUS PROPIAS asignaciones
 * (employeeId = su legajo). Se verifica la pertenencia antes de mutar.
 */
export const setMyAssignmentStatusAction = action(
  ['SUPERVISOR'],
  async (ctx, assignmentId: string, status: AssignmentStatus, eventId: string): Promise<ActionResult> => {
    const employeeId = ctx.session.employee?.id
    if (!employeeId) return { ok: false, error: 'Tu usuario no está vinculado a un legajo.' }

    const asg = await prisma.eventAssignment.findFirst({
      where: { id: assignmentId, deletedAt: null },
      select: { employeeId: true },
    })
    if (!asg) return { ok: false, error: 'Asignación no encontrada.' }
    if (asg.employeeId !== employeeId) return { ok: false, error: 'Solo podés cambiar tus propias asignaciones.' }

    try {
      await setAssignmentStatus(prisma, assignmentId, status, ctx.actorId)
      revalidatePath(`/supervisor/eventos/${eventId}`)
      return { ok: true }
    } catch (e) {
      if (e instanceof ActionError) return { ok: false, error: e.message }
      throw e
    }
  },
)

// ── Fichaje del grupo (solo en eventos que supervisa) ──

function supErr(e: unknown): ActionResult {
  if (e instanceof ActionError) return { ok: false, error: e.message }
  throw e
}

export const supervisorToggleClockAction = action(
  ['SUPERVISOR'],
  async (ctx, eventId: string, memberEmployeeId: string, location: LocationInput): Promise<ActionResult> => {
    const supervisorEmployeeId = ctx.session.employee?.id
    if (!supervisorEmployeeId) return { ok: false, error: 'Tu usuario no está vinculado a un legajo.' }
    try {
      await supervisorToggle(
        prisma,
        { supervisorEmployeeId, supervisorUserId: ctx.actorId, eventId, memberEmployeeId, location },
        new Date(),
      )
      revalidatePath(`/supervisor/eventos/${eventId}`)
      return { ok: true }
    } catch (e) {
      return supErr(e)
    }
  },
)

export const supervisorRetroactiveAction = action(
  ['SUPERVISOR'],
  async (
    ctx,
    eventId: string,
    memberEmployeeId: string,
    checkInLocal: string,
    checkOutLocal: string,
  ): Promise<ActionResult> => {
    const supervisorEmployeeId = ctx.session.employee?.id
    if (!supervisorEmployeeId) return { ok: false, error: 'Tu usuario no está vinculado a un legajo.' }
    if (!checkInLocal || !checkOutLocal) return { ok: false, error: 'Cargá entrada y salida.' }
    try {
      await supervisorRetroactive(prisma, {
        supervisorEmployeeId,
        supervisorUserId: ctx.actorId,
        eventId,
        memberEmployeeId,
        checkIn: baLocalToInstant(checkInLocal),
        checkOut: baLocalToInstant(checkOutLocal),
      })
      revalidatePath(`/supervisor/eventos/${eventId}`)
      return { ok: true }
    } catch (e) {
      return supErr(e)
    }
  },
)
