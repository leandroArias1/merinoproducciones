'use server'

import { revalidatePath } from 'next/cache'
import { action, ActionError } from '@/lib/auth/action'
import { prisma } from '@/lib/db'
import { eventSchema, assignmentSchema, type EventStatus, type AssignmentStatus } from '@/lib/events/schema'
import { createEvent, updateEvent, setEventStatus, softDeleteEvent } from '@/lib/events/events'
import {
  createAssignment,
  updateAssignment,
  setAssignmentStatus,
  deleteAssignment,
  checkAssignmentConflicts,
} from '@/lib/events/assignments'
import { baLocalToInstant, workDateKeyOf, baDayLabel } from '@/lib/events/time'

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string }

function fail(e: unknown): ActionResult {
  if (e instanceof ActionError) return { ok: false, error: e.message }
  throw e
}

// ── Eventos ──
export const createEventAction = action(['ADMIN'], async (ctx, raw: unknown): Promise<ActionResult> => {
  const parsed = eventSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  try {
    const id = await createEvent(prisma, parsed.data, ctx.actorId)
    revalidatePath('/admin/eventos')
    return { ok: true, id }
  } catch (e) {
    return fail(e)
  }
})

export const updateEventAction = action(['ADMIN'], async (_ctx, id: string, raw: unknown): Promise<ActionResult> => {
  const parsed = eventSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  try {
    await updateEvent(prisma, id, parsed.data)
    revalidatePath(`/admin/eventos/${id}`)
    return { ok: true, id }
  } catch (e) {
    return fail(e)
  }
})

export const setEventStatusAction = action(
  ['ADMIN'],
  async (ctx, id: string, status: EventStatus): Promise<ActionResult> => {
    try {
      await setEventStatus(prisma, id, status, ctx.actorId)
      revalidatePath('/admin/eventos')
      revalidatePath(`/admin/eventos/${id}`)
      return { ok: true }
    } catch (e) {
      return fail(e)
    }
  },
)

export const deleteEventAction = action(['ADMIN'], async (ctx, id: string): Promise<ActionResult> => {
  try {
    await softDeleteEvent(prisma, id, ctx.actorId)
    revalidatePath('/admin/eventos')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
})

// ── Asignaciones ──
export const createAssignmentAction = action(
  ['ADMIN'],
  async (ctx, eventId: string, raw: unknown): Promise<ActionResult> => {
    const parsed = assignmentSchema.safeParse(raw)
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
    try {
      const id = await createAssignment(prisma, eventId, parsed.data, ctx.actorId)
      revalidatePath(`/admin/eventos/${eventId}`)
      return { ok: true, id }
    } catch (e) {
      return fail(e)
    }
  },
)

export const updateAssignmentAction = action(
  ['ADMIN'],
  async (ctx, id: string, eventId: string, raw: unknown): Promise<ActionResult> => {
    const parsed = assignmentSchema.safeParse(raw)
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
    try {
      await updateAssignment(prisma, id, parsed.data, ctx.actorId)
      revalidatePath(`/admin/eventos/${eventId}`)
      return { ok: true }
    } catch (e) {
      return fail(e)
    }
  },
)

export const setAssignmentStatusAction = action(
  ['ADMIN'],
  async (ctx, id: string, status: AssignmentStatus, eventId: string): Promise<ActionResult> => {
    try {
      await setAssignmentStatus(prisma, id, status, ctx.actorId)
      revalidatePath(`/admin/eventos/${eventId}`)
      return { ok: true }
    } catch (e) {
      return fail(e)
    }
  },
)

export const deleteAssignmentAction = action(
  ['ADMIN'],
  async (ctx, id: string, eventId: string): Promise<ActionResult> => {
    try {
      await deleteAssignment(prisma, id, ctx.actorId)
      revalidatePath(`/admin/eventos/${eventId}`)
      return { ok: true }
    } catch (e) {
      return fail(e)
    }
  },
)

/** Preview en vivo: a qué workDate imputa + conflictos (turnos solapados / licencia). */
export type PreviewResult = {
  workDateLabel: string
  overlaps: { eventName: string; role: string }[]
  leaveType: string | null
}
export const assignmentPreviewAction = action(
  ['ADMIN'],
  async (
    _ctx,
    input: { employeeId: string; startAt: string; endAt: string; excludeId?: string },
  ): Promise<PreviewResult | null> => {
    if (!input.employeeId || !input.startAt || !input.endAt) return null
    const startAt = baLocalToInstant(input.startAt)
    const endAt = baLocalToInstant(input.endAt)
    const report = await checkAssignmentConflicts(prisma, {
      employeeId: input.employeeId,
      startAt,
      endAt,
      excludeId: input.excludeId,
    })
    return {
      workDateLabel: baDayLabel(workDateKeyOf(startAt)),
      overlaps: report.overlaps.map((o) => ({ eventName: o.eventName, role: o.role })),
      leaveType: report.leave?.type ?? null,
    }
  },
)
