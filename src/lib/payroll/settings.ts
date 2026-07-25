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

/**
 * Cambia el descuento por falta desde `effectiveDate`. Versiona: cierra el
 * vigente el día anterior y abre el nuevo.
 *
 * BORDE (bug real de prod): si el vigente empieza el MISMO día en que se lo
 * quiere cambiar, cerrarlo "el día anterior" le dejaría `effectiveTo` <
 * `effectiveFrom` y la DB lo rechaza con `payroll_config_effective_chk`. Pasa
 * siempre que se corrige un valor recién cargado — el caso más común de todos.
 * En ese caso NO se versiona: se pisa el vigente. Es lo correcto además de
 * seguro, porque un valor que empieza hoy todavía no rigió ningún día cerrado,
 * así que no hay período histórico que preservar. Mismo criterio si la fecha
 * pedida es anterior al inicio del vigente (carga retroactiva).
 */
export async function setAbsentDeductionCents(db: Db, cents: bigint, effectiveDate: Date, actorId: string): Promise<boolean> {
  if (cents < 0n) throw new Error('El descuento no puede ser negativo.')
  const vigente = await db.payrollConfig.findFirst({
    where: { effectiveTo: null, deletedAt: null },
    select: { id: true, absentDeductionCents: true, effectiveFrom: true },
  })
  if (vigente && vigente.absentDeductionCents === cents) return false // sin cambio

  const fromKey = dateKey(effectiveDate)
  // Claves 'YYYY-MM-DD' de columnas @db.Date: comparación lexicográfica = cronológica.
  const pisarVigente = vigente != null && dateKey(vigente.effectiveFrom) >= fromKey

  await db.$transaction(async (tx) => {
    if (pisarVigente) {
      await tx.payrollConfig.update({
        where: { id: vigente!.id },
        data: { absentDeductionCents: cents, effectiveFrom: effectiveDate },
      })
    } else {
      if (vigente) {
        await tx.payrollConfig.update({ where: { id: vigente.id }, data: { effectiveTo: workDateFromKey(shiftKey(fromKey, -1)) } })
      }
      await tx.payrollConfig.create({ data: { absentDeductionCents: cents, effectiveFrom: effectiveDate, effectiveTo: null } })
    }
    await writePayrollAudit(tx, {
      action: 'config-change',
      entityType: 'PayrollConfig',
      entityId: 'absentDeduction',
      before: vigente ? { absentDeductionCents: vigente.absentDeductionCents.toString() } : null,
      after: { absentDeductionCents: cents.toString(), effectiveFrom: fromKey, pisado: pisarVigente },
      actorId,
    })
  })
  return true
}
