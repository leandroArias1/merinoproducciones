import { Prisma } from '@/generated/prisma/client'
import type { PrismaClient, AttendanceStatus, AttendanceSource as PrismaAttendanceSource } from '@/generated/prisma/client'
import type { AttendanceResult } from '@/lib/domain/attendance'
import { dateKey } from './timezone'

/**
 * Persistencia del resultado del motor. Dos capas:
 *  - `planAttendance`: decisión PURA (sin DB) de qué hacer con la fila.
 *  - `executePlan`: la ejecuta dentro de una transacción.
 *
 * Regla clave: se protege el STATUS de las filas MANUAL, NO la fila entera.
 * workedMinutes/expectedMinutes/warnings se refrescan SIEMPRE, incluso en
 * filas MANUAL — si no, el JUSTIFIED que cargó el admin nunca se enteraría de
 * las fichadas que aparecieron después.
 */

// Cliente de transacción interactiva de Prisma.
export type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

export type AttendanceSource = 'GENERATED' | 'MANUAL'

export interface ExistingRow {
  id: string
  status: string
  source: AttendanceSource
  workedMinutes: number
  expectedMinutes: number | null
  warnings: string[]
}

/** Warning propio del caller (no del motor) para MANUAL sin expectativa. */
export const MANUAL_SIN_EXPECTATIVA = 'MANUAL_SIN_EXPECTATIVA'

interface Snapshot {
  status: string
  workedMinutes: number
  expectedMinutes: number | null
}

interface AuditPayload {
  action: 'create' | 'update' | 'delete'
  before: Snapshot | null
  after: Snapshot | null
}

export type Plan =
  | { action: 'noop'; finalStatus: string | null }
  | {
      action: 'create'
      finalStatus: string
      create: {
        status: string
        source: AttendanceSource
        workedMinutes: number
        expectedMinutes: number | null
        warnings: string[]
      }
      audit: AuditPayload
    }
  | {
      action: 'update'
      finalStatus: string
      id: string
      data: {
        status?: string
        workedMinutes: number
        expectedMinutes: number | null
        warnings: string[]
      }
      audit: AuditPayload | null // null = solo cambiaron derivados (sin cambio de status)
    }
  | { action: 'delete'; finalStatus: null; id: string; audit: AuditPayload }

function warningsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function snapshot(r: ExistingRow): Snapshot {
  return { status: r.status, workedMinutes: r.workedMinutes, expectedMinutes: r.expectedMinutes }
}

/**
 * Decide qué hacer con la fila. PURA: no toca DB, es fácil de testear.
 */
export function planAttendance(result: AttendanceResult, existing: ExistingRow | null): Plan {
  // ── El motor no genera registro para este día ──
  if (!result.record) {
    if (!existing) return { action: 'noop', finalStatus: null }

    if (existing.source === 'MANUAL') {
      // Se conserva el status manual; se refrescan derivados (a 0, no hay
      // actividad) y se marca la inconsistencia para reconciliación.
      const warnings = [MANUAL_SIN_EXPECTATIVA]
      const same =
        existing.workedMinutes === 0 &&
        existing.expectedMinutes === null &&
        warningsEqual(existing.warnings, warnings)
      if (same) return { action: 'noop', finalStatus: existing.status }
      return {
        action: 'update',
        finalStatus: existing.status,
        id: existing.id,
        data: { workedMinutes: 0, expectedMinutes: null, warnings },
        audit: null,
      }
    }

    // GENERATED sin expectativa -> se borra.
    return {
      action: 'delete',
      finalStatus: null,
      id: existing.id,
      audit: { action: 'delete', before: snapshot(existing), after: null },
    }
  }

  const eng = result // record: true
  const after: Snapshot = {
    status: eng.status,
    workedMinutes: eng.workedMinutes,
    expectedMinutes: eng.expectedMinutes,
  }

  // ── No existía la fila: se crea GENERATED ──
  if (!existing) {
    return {
      action: 'create',
      finalStatus: eng.status,
      create: {
        status: eng.status,
        source: 'GENERATED',
        workedMinutes: eng.workedMinutes,
        expectedMinutes: eng.expectedMinutes,
        warnings: eng.warnings,
      },
      audit: { action: 'create', before: null, after },
    }
  }

  const derivedSame =
    existing.workedMinutes === eng.workedMinutes &&
    existing.expectedMinutes === eng.expectedMinutes &&
    warningsEqual(existing.warnings, eng.warnings)

  // ── Fila MANUAL: se preserva el STATUS, se refrescan derivados ──
  if (existing.source === 'MANUAL') {
    if (derivedSame) return { action: 'noop', finalStatus: existing.status }
    return {
      action: 'update',
      finalStatus: existing.status,
      id: existing.id,
      data: {
        workedMinutes: eng.workedMinutes,
        expectedMinutes: eng.expectedMinutes,
        warnings: eng.warnings,
      },
      audit: null, // el status no cambia: no se audita
    }
  }

  // ── Fila GENERATED: se sobreescribe todo ──
  const statusChanged = existing.status !== eng.status
  if (!statusChanged && derivedSame) return { action: 'noop', finalStatus: existing.status }
  return {
    action: 'update',
    finalStatus: eng.status,
    id: existing.id,
    data: {
      status: eng.status,
      workedMinutes: eng.workedMinutes,
      expectedMinutes: eng.expectedMinutes,
      warnings: eng.warnings,
    },
    audit: statusChanged ? { action: 'update', before: snapshot(existing), after } : null,
  }
}

/**
 * Ejecuta un plan dentro de una transacción. Todo cambio de STATUS escribe
 * AuditLog (domain "ATTENDANCE"); actorId es null cuando lo dispara el cron.
 */
export async function executePlan(
  tx: Tx,
  plan: Plan,
  employeeId: string,
  workDate: Date,
  actorId: string | null,
): Promise<void> {
  if (plan.action === 'noop') return

  const entityId = `${employeeId}:${dateKey(workDate)}`

  if (plan.action === 'create') {
    await tx.attendance.create({
      data: {
        employeeId,
        workDate,
        status: plan.create.status as AttendanceStatus,
        source: plan.create.source as PrismaAttendanceSource,
        workedMinutes: plan.create.workedMinutes,
        expectedMinutes: plan.create.expectedMinutes,
        warnings: plan.create.warnings,
      },
    })
    await writeAudit(tx, plan.audit, entityId, actorId)
    return
  }

  if (plan.action === 'update') {
    await tx.attendance.update({
      where: { id: plan.id },
      data: {
        ...(plan.data.status !== undefined ? { status: plan.data.status as AttendanceStatus } : {}),
        workedMinutes: plan.data.workedMinutes,
        expectedMinutes: plan.data.expectedMinutes,
        warnings: plan.data.warnings,
      },
    })
    if (plan.audit) await writeAudit(tx, plan.audit, entityId, actorId)
    return
  }

  // delete
  await tx.attendance.delete({ where: { id: plan.id } })
  await writeAudit(tx, plan.audit, entityId, actorId)
}

/**
 * Ejecuta un CONJUNTO de planes batcheando el path CREATE con `createMany`:
 * todas las altas de un lote se insertan en 2 statements (attendance + auditLog)
 * en vez de 2 por fila. Los update/delete siguen por fila (son raros en régimen
 * nocturno). NO toca la capa de decisión (`planAttendance`): recibe planes ya
 * decididos. El entityId del audit se deriva de employeeId+workDate, así que no
 * hace falta el id devuelto por el insert (por eso `createMany` alcanza).
 *
 * Motivo: sobre el pooler (~145ms/statement medido en prod) el path fila-por-
 * fila hacía que un backfill de ~13 empleados rozara el maxDuration=60 de
 * Vercel. Con createMany el costo de las altas pasa a O(lotes), no O(filas).
 */
export async function executePlanBatch(
  tx: Tx,
  items: Array<{ plan: Plan; employeeId: string; workDate: Date }>,
  actorId: string | null,
): Promise<void> {
  const attData: Prisma.AttendanceCreateManyInput[] = []
  const auditData: Prisma.AuditLogCreateManyInput[] = []

  for (const it of items) {
    if (it.plan.action !== 'create') continue
    attData.push({
      employeeId: it.employeeId,
      workDate: it.workDate,
      status: it.plan.create.status as AttendanceStatus,
      source: it.plan.create.source as PrismaAttendanceSource,
      workedMinutes: it.plan.create.workedMinutes,
      expectedMinutes: it.plan.create.expectedMinutes,
      warnings: it.plan.create.warnings,
    })
    auditData.push({
      domain: 'ATTENDANCE',
      action: it.plan.audit.action,
      entityType: 'Attendance',
      entityId: `${it.employeeId}:${dateKey(it.workDate)}`,
      before: it.plan.audit.before === null ? Prisma.DbNull : (it.plan.audit.before as unknown as Prisma.InputJsonValue),
      after: it.plan.audit.after === null ? Prisma.DbNull : (it.plan.audit.after as unknown as Prisma.InputJsonValue),
      actorId,
    })
  }

  if (attData.length > 0) {
    await tx.attendance.createMany({ data: attData })
    await tx.auditLog.createMany({ data: auditData })
  }

  // update/delete: por fila (reusa executePlan). Los noop se filtran antes.
  for (const it of items) {
    if (it.plan.action === 'update' || it.plan.action === 'delete') {
      await executePlan(tx, it.plan, it.employeeId, it.workDate, actorId)
    }
  }
}

async function writeAudit(
  tx: Tx,
  audit: AuditPayload,
  entityId: string,
  actorId: string | null,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      domain: 'ATTENDANCE',
      action: audit.action,
      entityType: 'Attendance',
      entityId,
      before: audit.before === null ? Prisma.DbNull : (audit.before as unknown as Prisma.InputJsonValue),
      after: audit.after === null ? Prisma.DbNull : (audit.after as unknown as Prisma.InputJsonValue),
      actorId,
    },
  })
}
