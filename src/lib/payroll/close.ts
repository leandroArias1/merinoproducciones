import type { PrismaClient } from '@/generated/prisma/client'
import { ActionError } from '@/lib/auth/action'
import { computePayrollItem } from '@/lib/domain/payroll'
import { dateKey } from '@/lib/attendance/timezone'
import { DateTime } from 'luxon'
import { BA_ZONE } from '@/lib/attendance/timezone'
import { buildPeriodRoster, type EmployeePayroll } from './build-input'
import { writePayrollAudit } from './audit'

/**
 * Cierre de liquidaciones. Un PayrollItem puede cerrarse INDIVIDUALMENTE (baja a
 * mitad de mes) antes de que se cierre el PayrollPeriod completo (fin de mes).
 * El snapshot (base/deduction/net/absentDays) se CONGELA al CLOSED; las líneas se
 * regeneran (derivadas). Todo cierre/reapertura/pago escribe AuditLog PAYROLL.
 */

type Db = PrismaClient

/** Asegura el PayrollPeriod (OPEN) de (año, mes). findFirst (unique parcial), no findUnique. */
export async function ensurePeriod(db: Db, year: number, month: number): Promise<{ id: string; status: string }> {
  const found = await db.payrollPeriod.findFirst({ where: { year, month, deletedAt: null }, select: { id: true, status: true } })
  if (found) return found
  return db.payrollPeriod.create({ data: { year, month, status: 'OPEN' }, select: { id: true, status: true } })
}

/**
 * Calcula, persiste y CIERRA (o marca BLOCKED) el ítem de un empleado. Si ya
 * está CLOSED/PAID (p.ej. cerrado por baja), NO lo recalcula. En una transacción.
 */
async function upsertAndCloseItem(db: Db, periodId: string, emp: EmployeePayroll, actorId: string): Promise<'closed' | 'blocked' | 'skipped'> {
  const result = computePayrollItem(emp.input)

  return db.$transaction(async (tx) => {
    const existing = await tx.payrollItem.findFirst({
      where: { periodId, employeeId: emp.employeeId, deletedAt: null },
      select: { id: true, status: true, netCents: true },
    })
    if (existing && (existing.status === 'CLOSED' || existing.status === 'PAID')) return 'skipped'

    // ── Bloqueado: días sin resolver. Queda BLOCKED, sin snapshot ni cierre. ──
    if (result.status === 'BLOCKED') {
      if (existing) await tx.payrollItem.update({ where: { id: existing.id }, data: { status: 'BLOCKED' } })
      else await tx.payrollItem.create({ data: { periodId, employeeId: emp.employeeId, status: 'BLOCKED' } })
      return 'blocked'
    }

    // ── OK: snapshot + CLOSED + líneas + audit. ──
    const snapshot = {
      status: 'CLOSED' as const,
      baseCents: result.baseCents,
      deductionCents: result.deductionCents,
      netCents: result.netCents,
      absentDays: result.absentDays,
      closedAt: new Date(),
      closedById: actorId,
    }
    let itemId: string
    if (existing) {
      await tx.payrollItem.update({ where: { id: existing.id }, data: snapshot })
      itemId = existing.id
      await tx.payrollLine.deleteMany({ where: { itemId } }) // líneas derivadas: se regeneran
    } else {
      const created = await tx.payrollItem.create({ data: { periodId, employeeId: emp.employeeId, ...snapshot }, select: { id: true } })
      itemId = created.id
    }
    await tx.payrollLine.createMany({
      data: result.lines.map((l, i) => ({ itemId, kind: l.kind, concept: l.concept, amountCents: l.amountCents, sortOrder: i })),
    })
    await writePayrollAudit(tx, {
      action: 'close-item',
      entityType: 'PayrollItem',
      entityId: itemId,
      before: existing ? { status: existing.status, netCents: existing.netCents.toString() } : null,
      after: { status: 'CLOSED', netCents: result.netCents.toString(), absentDays: result.absentDays },
      actorId,
    })
    return 'closed'
  })
}

export interface ClosePeriodSummary {
  periodId: string
  closed: number
  blocked: number
  skipped: number // ya cerrados (baja)
}

/**
 * Cierre de FIN DE MES: cierra en lote los ítems de los empleados NO bloqueados.
 * Los bloqueados quedan BLOCKED (pendientes). Los ya cerrados por baja no se
 * recalculan. El período pasa a CLOSED aunque queden bloqueados (se difieren).
 */
export async function closePeriod(db: Db, year: number, month: number, actorId: string): Promise<ClosePeriodSummary> {
  const period = await ensurePeriod(db, year, month)
  if (period.status === 'PAID') throw new ActionError('CONFLICT', 'El período ya está pagado.')

  const roster = await buildPeriodRoster(db, year, month)
  const summary: ClosePeriodSummary = { periodId: period.id, closed: 0, blocked: 0, skipped: 0 }
  for (const emp of roster) {
    const r = await upsertAndCloseItem(db, period.id, emp, actorId)
    summary[r]++
  }

  await db.$transaction(async (tx) => {
    await tx.payrollPeriod.update({ where: { id: period.id }, data: { status: 'CLOSED', closedAt: new Date(), closedById: actorId } })
    await writePayrollAudit(tx, {
      action: 'close-period',
      entityType: 'PayrollPeriod',
      entityId: period.id,
      before: { status: period.status },
      after: { status: 'CLOSED', closed: summary.closed, blocked: summary.blocked },
      actorId,
    })
  })
  return summary
}

/**
 * BAJA a mitad de mes: genera y CIERRA el ítem del empleado con el tramo
 * proporcional a `bajaDate`. Queda cerrado individualmente; el cierre de fin de
 * mes no lo recalcula. Lo dispara la acción de baja (deleteEmployeeAction).
 */
export async function generateBajaItem(db: Db, employeeId: string, bajaDate: Date, actorId: string): Promise<'closed' | 'blocked'> {
  const key = dateKey(bajaDate)
  const dt = DateTime.fromISO(key, { zone: BA_ZONE })
  const period = await ensurePeriod(db, dt.year, dt.month)

  const roster = await buildPeriodRoster(db, dt.year, dt.month, { employeeIds: [employeeId], asOfEndKey: key })
  if (roster.length === 0) return 'blocked' // no estuvo activo en el mes (nada que liquidar)

  const r = await upsertAndCloseItem(db, period.id, roster[0], actorId)
  return r === 'skipped' ? 'closed' : r
}

/**
 * Reapertura de un período CLOSED (nunca PAID): vuelve a OPEN y pone sus ítems no
 * pagados en DRAFT para que el próximo cierre los recalcule. Auditado.
 */
export async function reopenPeriod(db: Db, year: number, month: number, actorId: string): Promise<void> {
  const period = await db.payrollPeriod.findFirst({ where: { year, month, deletedAt: null }, select: { id: true, status: true } })
  if (!period) throw new ActionError('NOT_FOUND', 'Período no encontrado.')
  if (period.status === 'PAID') throw new ActionError('CONFLICT', 'Un período PAGADO no se reabre. Corregí con un ajuste en el mes siguiente.')
  if (period.status !== 'CLOSED') return // ya está abierto

  await db.$transaction(async (tx) => {
    await tx.payrollItem.updateMany({ where: { periodId: period.id, deletedAt: null, status: { not: 'PAID' } }, data: { status: 'DRAFT', closedAt: null, closedById: null } })
    await tx.payrollPeriod.update({ where: { id: period.id }, data: { status: 'OPEN', closedAt: null, closedById: null } })
    await writePayrollAudit(tx, { action: 'reopen-period', entityType: 'PayrollPeriod', entityId: period.id, before: { status: 'CLOSED' }, after: { status: 'OPEN' }, actorId })
  })
}

/** Marca un período CLOSED como PAID (y sus ítems cerrados). Auditado. */
export async function payPeriod(db: Db, year: number, month: number, actorId: string): Promise<void> {
  const period = await db.payrollPeriod.findFirst({ where: { year, month, deletedAt: null }, select: { id: true, status: true } })
  if (!period) throw new ActionError('NOT_FOUND', 'Período no encontrado.')
  if (period.status !== 'CLOSED') throw new ActionError('CONFLICT', 'Solo se paga un período CERRADO.')

  await db.$transaction(async (tx) => {
    await tx.payrollItem.updateMany({ where: { periodId: period.id, deletedAt: null, status: 'CLOSED' }, data: { status: 'PAID' } })
    await tx.payrollPeriod.update({ where: { id: period.id }, data: { status: 'PAID', paidAt: new Date(), paidById: actorId } })
    await writePayrollAudit(tx, { action: 'pay-period', entityType: 'PayrollPeriod', entityId: period.id, before: { status: 'CLOSED' }, after: { status: 'PAID' }, actorId })
  })
}
