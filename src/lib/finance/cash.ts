import type { PrismaClient, ExpenseCategory } from '@/generated/prisma/client'
import { ActionError } from '@/lib/auth/action'
import { writeCashAudit } from './audit'

/**
 * Operaciones de escritura de caja/gastos. Todo en transacción, auditado
 * (domain CASH), soft-delete. BigInt puro. Ver src/lib/domain/finance.ts.
 */

type Db = PrismaClient

/** Pago de cliente: UN solo acto = ingreso de caja + abono al evento. */
export async function registerClientPayment(
  db: Db,
  args: { eventId: string; amountCents: bigint; occurredOn: Date; note?: string },
  actorId: string,
): Promise<string> {
  if (args.amountCents <= 0n) throw new ActionError('VALIDATION', 'El monto debe ser mayor a 0.')
  const event = await db.event.findFirst({ where: { id: args.eventId, deletedAt: null }, select: { id: true } })
  if (!event) throw new ActionError('NOT_FOUND', 'Evento no encontrado.')

  return db.$transaction(async (tx) => {
    const mv = await tx.cashMovement.create({
      data: { direction: 'INCOME', category: 'CLIENT_PAYMENT', amountCents: args.amountCents, occurredOn: args.occurredOn, eventId: args.eventId, note: args.note ?? null },
      select: { id: true },
    })
    await writeCashAudit(tx, { action: 'client-payment', entityType: 'CashMovement', entityId: mv.id, before: null, after: { eventId: args.eventId, amountCents: args.amountCents.toString() }, actorId })
    return mv.id
  })
}

/** Registrar un gasto. `pay` presente = se paga al toque (Expense PAID + egreso de caja). */
export async function registerExpense(
  db: Db,
  args: {
    description: string
    amountCents: bigint
    incurredOn: Date
    category: ExpenseCategory
    providerId?: string | null
    eventId?: string | null
    pay?: { occurredOn: Date }
  },
  actorId: string,
): Promise<string> {
  if (args.amountCents <= 0n) throw new ActionError('VALIDATION', 'El monto debe ser mayor a 0.')

  return db.$transaction(async (tx) => {
    const exp = await tx.expense.create({
      data: {
        description: args.description,
        amountCents: args.amountCents,
        incurredOn: args.incurredOn,
        category: args.category,
        providerId: args.providerId ?? null,
        eventId: args.eventId ?? null,
        status: args.pay ? 'PAID' : 'PENDING',
      },
      select: { id: true },
    })
    await writeCashAudit(tx, { action: 'expense-create', entityType: 'Expense', entityId: exp.id, before: null, after: { amountCents: args.amountCents.toString(), status: args.pay ? 'PAID' : 'PENDING', eventId: args.eventId ?? null }, actorId })

    if (args.pay) {
      const mv = await tx.cashMovement.create({
        data: { direction: 'EXPENSE', category: 'EXPENSE_PAYMENT', amountCents: args.amountCents, occurredOn: args.pay.occurredOn, expenseId: exp.id, note: args.description },
        select: { id: true },
      })
      await writeCashAudit(tx, { action: 'expense-pay', entityType: 'CashMovement', entityId: mv.id, before: null, after: { expenseId: exp.id, amountCents: args.amountCents.toString() }, actorId })
    }
    return exp.id
  })
}

/** Pagar un Expense PENDING: crea el egreso de caja y lo pasa a PAID. */
export async function payExpense(db: Db, expenseId: string, occurredOn: Date, actorId: string): Promise<void> {
  const exp = await db.expense.findFirst({ where: { id: expenseId, deletedAt: null }, select: { id: true, status: true, amountCents: true, description: true } })
  if (!exp) throw new ActionError('NOT_FOUND', 'Gasto no encontrado.')
  if (exp.status === 'PAID') throw new ActionError('CONFLICT', 'El gasto ya está pagado.')

  await db.$transaction(async (tx) => {
    const mv = await tx.cashMovement.create({
      data: { direction: 'EXPENSE', category: 'EXPENSE_PAYMENT', amountCents: exp.amountCents, occurredOn, expenseId: exp.id, note: exp.description },
      select: { id: true },
    })
    await tx.expense.update({ where: { id: exp.id }, data: { status: 'PAID' } })
    await writeCashAudit(tx, { action: 'expense-pay', entityType: 'Expense', entityId: exp.id, before: { status: 'PENDING' }, after: { status: 'PAID', movementId: mv.id }, actorId })
  })
}

/**
 * Anular un movimiento de caja (soft-delete). Si saldaba un Expense, ese gasto
 * vuelve a PENDING. El pendiente del evento se recalcula solo (es derivado de los
 * INCOME no borrados) → no queda plata fantasma.
 */
export async function deleteMovement(db: Db, movementId: string, actorId: string): Promise<void> {
  const mv = await db.cashMovement.findFirst({ where: { id: movementId, deletedAt: null }, select: { id: true, expenseId: true, direction: true, amountCents: true } })
  if (!mv) throw new ActionError('NOT_FOUND', 'Movimiento no encontrado.')

  await db.$transaction(async (tx) => {
    await tx.cashMovement.update({ where: { id: mv.id }, data: { deletedAt: new Date() } })
    // Si era el pago de un gasto, el gasto vuelve a deber.
    if (mv.expenseId) {
      await tx.expense.updateMany({ where: { id: mv.expenseId, deletedAt: null }, data: { status: 'PENDING' } })
    }
    await writeCashAudit(tx, { action: 'movement-delete', entityType: 'CashMovement', entityId: mv.id, before: { direction: mv.direction, amountCents: mv.amountCents.toString() }, after: { deletedAt: 'set', revertedExpense: mv.expenseId ?? null }, actorId })
  })
}

/** Anular un gasto (soft-delete). También borra sus pagos (revierte caja). */
export async function deleteExpense(db: Db, expenseId: string, actorId: string): Promise<void> {
  const exp = await db.expense.findFirst({ where: { id: expenseId, deletedAt: null }, select: { id: true } })
  if (!exp) throw new ActionError('NOT_FOUND', 'Gasto no encontrado.')

  await db.$transaction(async (tx) => {
    // Borrar los pagos primero (para que no queden moviendo caja sin gasto).
    await tx.cashMovement.updateMany({ where: { expenseId: exp.id, deletedAt: null }, data: { deletedAt: new Date() } })
    await tx.expense.update({ where: { id: exp.id }, data: { deletedAt: new Date() } })
    await writeCashAudit(tx, { action: 'expense-delete', entityType: 'Expense', entityId: exp.id, before: null, after: { deletedAt: 'set' }, actorId })
  })
}
