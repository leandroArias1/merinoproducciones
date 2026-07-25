'use server'

import { revalidatePath } from 'next/cache'
import { action, ActionError } from '@/lib/auth/action'
import { prisma } from '@/lib/db'
import type { ExpenseCategory, PartyKind } from '@/generated/prisma/client'
import { registerClientPayment, registerExpense, payExpense, deleteMovement, deleteExpense } from '@/lib/finance/cash'
import { createParty, updateParty, deleteParty, setEventPrice } from '@/lib/finance/party'
import { setAbsentDeductionCents } from '@/lib/payroll/settings'
import { todayKeyBA, workDateFromKey } from '@/lib/attendance/timezone'

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string }

/**
 * Revalida TODAS las pantallas de finanzas, no solo /admin/caja.
 * Un pago/gasto/precio cambia saldo, por cobrar, por pagar, rentabilidad y
 * reportes a la vez, y el usuario dispara la acción desde cualquiera de ellas:
 * revalidar solo la ruta "principal" dejaba la pantalla donde está parado
 * mostrando el dato viejo (parecía que no había guardado). Bug real de prod.
 */
function revalidateCaja(): void {
  revalidatePath('/admin/caja')
  revalidatePath('/admin/caja/cobrar')
  revalidatePath('/admin/caja/pagar')
  revalidatePath('/admin/caja/rentabilidad')
  revalidatePath('/admin/reportes')
}

function fail(e: unknown): ActionResult {
  if (e instanceof ActionError) return { ok: false, error: e.message }
  return { ok: false, error: `Error inesperado: ${e instanceof Error ? e.message : String(e)}` }
}

/** Pesos (número del form) → centavos (BigInt). Único punto de conversión. */
function toCents(pesos: number): bigint {
  return BigInt(Math.round(pesos * 100))
}
function dateOf(key?: string): Date {
  return workDateFromKey(key && /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : todayKeyBA(new Date()))
}
const EXPENSE_CATS: ExpenseCategory[] = ['TRANSPORT', 'EQUIPMENT', 'VENUE', 'SUPPLIES', 'OTHER']

// ── Caja ──

export const registerClientPaymentAction = action(
  ['ADMIN'],
  async (ctx, eventId: string, amountPesos: number, occurredOnKey?: string, note?: string): Promise<ActionResult> => {
    if (!(amountPesos > 0)) return { ok: false, error: 'El monto debe ser mayor a 0.' }
    try {
      const id = await registerClientPayment(prisma, { eventId, amountCents: toCents(amountPesos), occurredOn: dateOf(occurredOnKey), note }, ctx.actorId)
      revalidateCaja()
      return { ok: true, id }
    } catch (e) {
      return fail(e)
    }
  },
)

export const registerExpenseAction = action(
  ['ADMIN'],
  async (
    ctx,
    args: { description: string; amountPesos: number; incurredOnKey?: string; category: string; providerId?: string | null; eventId?: string | null; payNow?: boolean },
  ): Promise<ActionResult> => {
    if (!args.description?.trim()) return { ok: false, error: 'La descripción es obligatoria.' }
    if (!(args.amountPesos > 0)) return { ok: false, error: 'El monto debe ser mayor a 0.' }
    if (!EXPENSE_CATS.includes(args.category as ExpenseCategory)) return { ok: false, error: 'Categoría inválida.' }
    try {
      const incurredOn = dateOf(args.incurredOnKey)
      const id = await registerExpense(
        prisma,
        {
          description: args.description.trim(),
          amountCents: toCents(args.amountPesos),
          incurredOn,
          category: args.category as ExpenseCategory,
          providerId: args.providerId ?? null,
          eventId: args.eventId ?? null,
          pay: args.payNow ? { occurredOn: incurredOn } : undefined,
        },
        ctx.actorId,
      )
      revalidateCaja()
      return { ok: true, id }
    } catch (e) {
      return fail(e)
    }
  },
)

export const payExpenseAction = action(['ADMIN'], async (ctx, expenseId: string, occurredOnKey?: string): Promise<ActionResult> => {
  try {
    await payExpense(prisma, expenseId, dateOf(occurredOnKey), ctx.actorId)
    revalidateCaja()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
})

export const deleteMovementAction = action(['ADMIN'], async (ctx, movementId: string): Promise<ActionResult> => {
  try {
    await deleteMovement(prisma, movementId, ctx.actorId)
    revalidateCaja()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
})

export const deleteExpenseAction = action(['ADMIN'], async (ctx, expenseId: string): Promise<ActionResult> => {
  try {
    await deleteExpense(prisma, expenseId, ctx.actorId)
    revalidateCaja()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
})

// ── Precio pactado del evento ──

export const setEventPriceAction = action(
  ['ADMIN'],
  async (ctx, eventId: string, agreedPesos: number | null, clientId: string | null): Promise<ActionResult> => {
    if (agreedPesos !== null && !(agreedPesos >= 0)) return { ok: false, error: 'El precio no puede ser negativo.' }
    try {
      await setEventPrice(prisma, eventId, { agreedCents: agreedPesos === null ? null : toCents(agreedPesos), clientId }, ctx.actorId)
      revalidateCaja()
      revalidatePath(`/admin/eventos/${eventId}`)
      return { ok: true }
    } catch (e) {
      return fail(e)
    }
  },
)

// ── Clientes / proveedores ──

export const createPartyAction = action(['ADMIN'], async (ctx, name: string, kind: string, notes?: string): Promise<ActionResult> => {
  if (kind !== 'CLIENT' && kind !== 'PROVIDER') return { ok: false, error: 'Tipo inválido.' }
  try {
    const id = await createParty(prisma, { name, kind: kind as PartyKind, notes }, ctx.actorId)
    revalidateCaja()
    return { ok: true, id }
  } catch (e) {
    return fail(e)
  }
})

export const updatePartyAction = action(['ADMIN'], async (ctx, id: string, name: string, notes?: string): Promise<ActionResult> => {
  try {
    await updateParty(prisma, id, { name, notes }, ctx.actorId)
    revalidateCaja()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
})

export const deletePartyAction = action(['ADMIN'], async (ctx, id: string): Promise<ActionResult> => {
  try {
    await deleteParty(prisma, id, ctx.actorId)
    revalidateCaja()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
})

// ── Config del descuento por falta ──

export const setDeductionAction = action(['ADMIN'], async (ctx, pesos: number, effectiveKey?: string): Promise<ActionResult> => {
  if (!(pesos >= 0)) return { ok: false, error: 'El descuento no puede ser negativo.' }
  try {
    await setAbsentDeductionCents(prisma, toCents(pesos), dateOf(effectiveKey), ctx.actorId)
    revalidateCaja()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
})
