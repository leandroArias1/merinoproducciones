import type { PrismaClient } from '@/generated/prisma/client'
import type { Tx } from '@/lib/attendance/persist'
import { dateKey, shiftKey, workDateFromKey } from '@/lib/attendance/timezone'
import { writePayrollAudit } from './audit'

/**
 * Versionado del sueldo mensual por empleado (como versionSchedules): cierra el
 * vigente y abre uno nuevo. NUNCA sobrescribe un tramo que YA rigió — así se
 * puede liquidar un mes viejo con el sueldo que estaba vigente entonces. Cada
 * cambio, auditado.
 */

type Db = PrismaClient

/**
 * El aumento en lote entra en UNA transacción. Puede quedar largo (4 statements
 * por empleado), así que se le da margen explícito: el default de Prisma son 5s
 * y sobre el pooler eso se alcanza antes de lo que parece (bug #1). Preferimos
 * una transacción con margen a la alternativa —lotes con rollback
 * compensatorio—, porque acá el todo-o-nada es sobre SUELDOS.
 */
const BULK_TX_TIMEOUT_MS = 20_000

/** Sueldo mensual vigente (centavos) o null si no tiene. */
export async function getVigenteSalaryCents(db: Db, employeeId: string): Promise<bigint | null> {
  const row = await db.salaryHistory.findFirst({
    where: { employeeId, effectiveTo: null, deletedAt: null },
    select: { monthlyCents: true },
  })
  return row?.monthlyCents ?? null
}

/**
 * El trabajo de versionar, DENTRO de una transacción provista. Existe separado
 * para que el aumento en lote pueda meter N empleados en una sola transacción.
 *
 * BORDE (bug real de prod): si el sueldo vigente empieza el MISMO día en que se
 * lo quiere cambiar, cerrarlo "el día anterior" le deja `effectiveTo` <
 * `effectiveFrom` y la DB lo rechaza con `salary_history_effective_chk`
 * (Postgres 23514). Pasa siempre que se CORRIGE un sueldo recién cargado, que
 * es el caso más común de todos.
 *
 * En ese caso NO se versiona: se pisa el vigente. Es lo correcto además de
 * seguro, porque un sueldo que empieza hoy todavía no rigió ningún día
 * liquidado, así que no hay período histórico que preservar. Mismo criterio si
 * la fecha pedida es anterior al inicio del vigente (carga retroactiva) — y el
 * mismo que ya usa `setAbsentDeductionCents` para el descuento por falta.
 */
async function versionSalaryTx(tx: Tx, employeeId: string, monthlyCents: bigint, effectiveDate: Date, actorId: string): Promise<boolean> {
  const vigente = await tx.salaryHistory.findFirst({
    where: { employeeId, effectiveTo: null, deletedAt: null },
    orderBy: { effectiveFrom: 'desc' },
    select: { id: true, monthlyCents: true, effectiveFrom: true },
  })
  if (vigente && vigente.monthlyCents === monthlyCents) return false // sin cambio

  const fromKey = dateKey(effectiveDate)
  // Claves 'YYYY-MM-DD' de columnas @db.Date: comparación lexicográfica = cronológica.
  const pisarVigente = vigente != null && dateKey(vigente.effectiveFrom) >= fromKey

  if (pisarVigente) {
    await tx.salaryHistory.update({
      where: { id: vigente!.id },
      data: { monthlyCents, effectiveFrom: effectiveDate },
    })
  } else {
    if (vigente) {
      await tx.salaryHistory.update({
        where: { id: vigente.id },
        data: { effectiveTo: workDateFromKey(shiftKey(fromKey, -1)) },
      })
    }
    await tx.salaryHistory.create({
      data: { employeeId, monthlyCents, effectiveFrom: effectiveDate, effectiveTo: null },
    })
  }

  await writePayrollAudit(tx, {
    action: 'salary-change',
    entityType: 'SalaryHistory',
    entityId: employeeId,
    before: vigente ? { monthlyCents: vigente.monthlyCents.toString() } : null,
    after: { monthlyCents: monthlyCents.toString(), effectiveFrom: fromKey, pisado: pisarVigente },
    actorId,
  })
  return true
}

/**
 * Cambia el sueldo de UN empleado desde `effectiveDate`. Devuelve false si el
 * monto no cambió (no-op). En una transacción, auditado.
 */
export async function versionSalary(db: Db, employeeId: string, monthlyCents: bigint, effectiveDate: Date, actorId: string): Promise<boolean> {
  return db.$transaction((tx) => versionSalaryTx(tx, employeeId, monthlyCents, effectiveDate, actorId))
}

/**
 * Aumento en BULK (comodidad de UI). Aplica el MISMO monto a varios empleados,
 * pero cada uno versiona su propio SalaryHistory INDIVIDUALMENTE y con su propio
 * AuditLog — no es un atajo que saltee el versionado. Devuelve cuántos cambiaron.
 *
 * TODO O NADA: los N empleados van en UNA transacción. Antes era una
 * transacción por empleado dentro de un for, así que un fallo en el tercero
 * dejaba a los dos primeros con el sueldo nuevo y al resto con el viejo, sin
 * que nadie se enterara de dónde había cortado. En un aumento de sueldos ese
 * estado a medio aplicar es peor que no haber hecho nada: el error se ve y se
 * reintenta, la mezcla silenciosa no.
 */
export async function bulkSetSalary(db: Db, employeeIds: string[], monthlyCents: bigint, effectiveDate: Date, actorId: string): Promise<number> {
  return db.$transaction(
    async (tx) => {
      let changed = 0
      for (const id of employeeIds) {
        if (await versionSalaryTx(tx, id, monthlyCents, effectiveDate, actorId)) changed++
      }
      return changed
    },
    { maxWait: BULK_TX_TIMEOUT_MS, timeout: BULK_TX_TIMEOUT_MS },
  )
}
