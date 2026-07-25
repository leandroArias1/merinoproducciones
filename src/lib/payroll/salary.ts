import type { PrismaClient } from '@/generated/prisma/client'
import { dateKey, shiftKey, workDateFromKey } from '@/lib/attendance/timezone'
import { writePayrollAudit } from './audit'

/**
 * Versionado del sueldo mensual por empleado (como versionSchedules): cierra el
 * vigente y abre uno nuevo. NUNCA sobrescribe — así se puede liquidar un mes
 * viejo con el sueldo que estaba vigente entonces. Cada cambio, auditado.
 */

type Db = PrismaClient

/** Sueldo mensual vigente (centavos) o null si no tiene. */
export async function getVigenteSalaryCents(db: Db, employeeId: string): Promise<bigint | null> {
  const row = await db.salaryHistory.findFirst({
    where: { employeeId, effectiveTo: null, deletedAt: null },
    select: { monthlyCents: true },
  })
  return row?.monthlyCents ?? null
}

/**
 * Cambia el sueldo de UN empleado desde `effectiveDate`. Cierra el vigente
 * (effectiveTo = día anterior) y abre el nuevo. Devuelve false si el monto no
 * cambió (no-op). Todo en una transacción, auditado.
 */
export async function versionSalary(db: Db, employeeId: string, monthlyCents: bigint, effectiveDate: Date, actorId: string): Promise<boolean> {
  const vigente = await db.salaryHistory.findFirst({
    where: { employeeId, effectiveTo: null, deletedAt: null },
    select: { id: true, monthlyCents: true },
  })
  if (vigente && vigente.monthlyCents === monthlyCents) return false // sin cambio

  const closeKey = shiftKey(dateKey(effectiveDate), -1)

  await db.$transaction(async (tx) => {
    if (vigente) {
      await tx.salaryHistory.update({ where: { id: vigente.id }, data: { effectiveTo: workDateFromKey(closeKey) } })
    }
    await tx.salaryHistory.create({
      data: { employeeId, monthlyCents, effectiveFrom: effectiveDate, effectiveTo: null },
    })
    await writePayrollAudit(tx, {
      action: 'salary-change',
      entityType: 'SalaryHistory',
      entityId: employeeId,
      before: vigente ? { monthlyCents: vigente.monthlyCents.toString() } : null,
      after: { monthlyCents: monthlyCents.toString(), effectiveFrom: dateKey(effectiveDate) },
      actorId,
    })
  })
  return true
}

/**
 * Aumento en BULK (comodidad de UI). Aplica el MISMO monto a varios empleados,
 * pero cada uno versiona su propio SalaryHistory INDIVIDUALMENTE y con su propio
 * AuditLog — no es un atajo que saltee el versionado. Devuelve cuántos cambiaron.
 */
export async function bulkSetSalary(db: Db, employeeIds: string[], monthlyCents: bigint, effectiveDate: Date, actorId: string): Promise<number> {
  let changed = 0
  for (const id of employeeIds) {
    if (await versionSalary(db, id, monthlyCents, effectiveDate, actorId)) changed++
  }
  return changed
}
