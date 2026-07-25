import type { PrismaClient } from '@/generated/prisma/client'
import { dateKey, shiftKey, workDateFromKey } from '@/lib/attendance/timezone'
import { writePayrollAudit } from './audit'

/**
 * Config global de liquidación (hoy solo el descuento por falta), versionada
 * como el sueldo: se cierra el vigente y se abre uno nuevo. Auditado (PAYROLL).
 * Permite que el admin cambie los $30.000 sin tocar SQL, y que un mes viejo use
 * el valor que estaba vigente entonces.
 */

type Db = PrismaClient

/** Descuento por falta vigente (centavos), o null si no hay config. */
export async function getAbsentDeductionCents(db: Db): Promise<bigint | null> {
  const row = await db.payrollConfig.findFirst({ where: { effectiveTo: null, deletedAt: null }, select: { absentDeductionCents: true } })
  return row?.absentDeductionCents ?? null
}

/** Cambia el descuento por falta desde `effectiveDate`. Versiona (cierra el vigente, abre el nuevo). */
export async function setAbsentDeductionCents(db: Db, cents: bigint, effectiveDate: Date, actorId: string): Promise<boolean> {
  if (cents < 0n) throw new Error('El descuento no puede ser negativo.')
  const vigente = await db.payrollConfig.findFirst({ where: { effectiveTo: null, deletedAt: null }, select: { id: true, absentDeductionCents: true } })
  if (vigente && vigente.absentDeductionCents === cents) return false // sin cambio

  const closeKey = shiftKey(dateKey(effectiveDate), -1)
  await db.$transaction(async (tx) => {
    if (vigente) {
      await tx.payrollConfig.update({ where: { id: vigente.id }, data: { effectiveTo: workDateFromKey(closeKey) } })
    }
    await tx.payrollConfig.create({ data: { absentDeductionCents: cents, effectiveFrom: effectiveDate, effectiveTo: null } })
    await writePayrollAudit(tx, {
      action: 'config-change',
      entityType: 'PayrollConfig',
      entityId: 'absentDeduction',
      before: vigente ? { absentDeductionCents: vigente.absentDeductionCents.toString() } : null,
      after: { absentDeductionCents: cents.toString(), effectiveFrom: dateKey(effectiveDate) },
      actorId,
    })
  })
  return true
}
