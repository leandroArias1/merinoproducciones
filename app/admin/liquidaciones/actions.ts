'use server'

import { revalidatePath } from 'next/cache'
import { action, ActionError } from '@/lib/auth/action'
import { prisma } from '@/lib/db'
import { closePeriod, payPeriod, reopenPeriod } from '@/lib/payroll/close'
import { bulkSetSalary } from '@/lib/payroll/salary'
import { todayKeyBA, workDateFromKey } from '@/lib/attendance/timezone'

export type ActionResult = { ok: true } | { ok: false; error: string }

function fail(e: unknown): ActionResult {
  if (e instanceof ActionError) return { ok: false, error: e.message }
  return { ok: false, error: `Error inesperado: ${e instanceof Error ? e.message : String(e)}` }
}

/**
 * Cerrar/pagar/reabrir se dispara DESDE la página del mes, no desde el índice:
 * revalidar solo '/admin/liquidaciones' dejaba la pantalla del período mostrando
 * el estado viejo (parecía que el botón no había hecho nada). Mismo bug que caja.
 */
function revalidatePeriod(year: number, month: number): void {
  revalidatePath('/admin/liquidaciones')
  revalidatePath(`/admin/liquidaciones/${year}/${month}`)
}

function validPeriod(year: number, month: number): string | null {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return 'Año inválido.'
  if (!Number.isInteger(month) || month < 1 || month > 12) return 'Mes inválido.'
  return null
}

export const closePeriodAction = action(['ADMIN'], async (ctx, year: number, month: number): Promise<ActionResult> => {
  const err = validPeriod(year, month)
  if (err) return { ok: false, error: err }
  try {
    await closePeriod(prisma, year, month, ctx.actorId)
    revalidatePeriod(year, month)
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
})

export const payPeriodAction = action(['ADMIN'], async (ctx, year: number, month: number): Promise<ActionResult> => {
  const err = validPeriod(year, month)
  if (err) return { ok: false, error: err }
  try {
    await payPeriod(prisma, year, month, ctx.actorId)
    revalidatePeriod(year, month)
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
})

export const reopenPeriodAction = action(['ADMIN'], async (ctx, year: number, month: number): Promise<ActionResult> => {
  const err = validPeriod(year, month)
  if (err) return { ok: false, error: err }
  try {
    await reopenPeriod(prisma, year, month, ctx.actorId)
    revalidatePeriod(year, month)
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
})

/**
 * Aumento en BULK: mismo monto a varios empleados. Cada uno versiona su propio
 * SalaryHistory individualmente y auditado (el bulk es solo comodidad de UI).
 * `monthlyPesos` en pesos enteros; se guarda en centavos.
 */
export const bulkRaiseAction = action(
  ['ADMIN'],
  async (ctx, employeeIds: string[], monthlyPesos: number, effectiveDateKey?: string): Promise<ActionResult> => {
    if (!Array.isArray(employeeIds) || employeeIds.length === 0) return { ok: false, error: 'Elegí al menos un empleado.' }
    if (!Number.isInteger(monthlyPesos) || monthlyPesos < 0) return { ok: false, error: 'Monto inválido.' }
    const key = effectiveDateKey && /^\d{4}-\d{2}-\d{2}$/.test(effectiveDateKey) ? effectiveDateKey : todayKeyBA(new Date())
    try {
      const cents = BigInt(monthlyPesos) * 100n
      await bulkSetSalary(prisma, employeeIds, cents, workDateFromKey(key), ctx.actorId)
      revalidatePath('/admin/empleados')
      revalidatePath('/admin/liquidaciones')
      revalidatePath('/admin/liquidaciones/aumentos') // la pantalla desde donde se dispara
      return { ok: true }
    } catch (e) {
      return fail(e)
    }
  },
)
