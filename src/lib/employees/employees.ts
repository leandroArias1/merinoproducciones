import { DateTime } from 'luxon'
import { Prisma } from '@/generated/prisma/client'
import type { PrismaClient } from '@/generated/prisma/client'
import { ActionError } from '@/lib/auth/action'
import { BA_ZONE, workDateFromKey } from '@/lib/attendance/timezone'
import type { Tx } from '@/lib/attendance/persist'
import { versionSchedules } from './schedule-versioning'
import type { EmployeeInput } from './schema'

type Db = PrismaClient

function todayWorkDate(): Date {
  return workDateFromKey(DateTime.now().setZone(BA_ZONE).toISODate() as string)
}

function hireDateToWorkDate(hireDate: string): Date | null {
  return hireDate ? workDateFromKey(hireDate) : null
}

/** Categoría que determina el horario EFECTIVO: sin actividad no hay horario. */
function schedulingCategory(active: boolean, categoryId: string | null): string | null {
  return active ? categoryId : null
}

async function writeEmployeeAudit(
  tx: Tx,
  args: {
    action: 'create' | 'update' | 'delete'
    employeeId: string
    actorId: string
    before: Record<string, unknown> | null
    after: Record<string, unknown> | null
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      domain: 'EMPLOYEE',
      action: args.action,
      entityType: 'Employee',
      entityId: args.employeeId,
      before: args.before === null ? Prisma.DbNull : (args.before as Prisma.InputJsonValue),
      after: args.after === null ? Prisma.DbNull : (args.after as Prisma.InputJsonValue),
      actorId: args.actorId, // actorId REAL (viene del wrapper action)
    },
  })
}

/** DNI único ENTRE LOS ACTIVOS (findFirst + deletedAt:null): re-contratar el DNI
 *  de alguien dado de baja funciona; el de alguien activo falla. */
async function assertDocumentFree(db: Db, documentId: string, exceptId?: string): Promise<void> {
  const clash = await db.employee.findFirst({
    where: { documentId, deletedAt: null, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true },
  })
  if (clash) {
    throw new ActionError('CONFLICT', `Ya hay un empleado activo con el documento ${documentId}.`)
  }
}

function baseData(input: EmployeeInput) {
  return {
    firstName: input.firstName,
    lastName: input.lastName,
    documentId: input.documentId,
    email: input.email || null,
    phone: input.phone || null,
    position: input.position || null,
    employmentType: input.employmentType,
    hireDate: hireDateToWorkDate(input.hireDate),
    active: input.active,
  }
}

/**
 * Alta de un empleado DENTRO de una transacción provista. Sin chequeo de DNI
 * (lo hace el caller) para poder reusarse en el importador CSV, donde N altas
 * comparten una sola transacción (todo o nada). Genera los WorkSchedule desde
 * la plantilla de la categoría, igual que el alta manual.
 */
export async function insertEmployeeTx(
  tx: Tx,
  input: EmployeeInput,
  actorId: string,
  effectiveDate?: Date,
): Promise<string> {
  const categoryId = input.categoryId || null
  const eff = effectiveDate ?? hireDateToWorkDate(input.hireDate) ?? todayWorkDate()

  const emp = await tx.employee.create({ data: { ...baseData(input), categoryId }, select: { id: true } })
  // La categoría de scheduling es null si el empleado nace inactivo: sin
  // horarios vigentes, el motor devuelve record:false (no ABSENT).
  const schedCat = schedulingCategory(input.active, categoryId)
  if (schedCat) {
    await versionSchedules(tx, { employeeId: emp.id, newCategoryId: schedCat, effectiveDate: eff })
  }
  if (categoryId) {
    await writeEmployeeAudit(tx, {
      action: 'update',
      employeeId: emp.id,
      actorId,
      before: { categoryId: null },
      after: { categoryId },
    })
  }
  return emp.id
}

export async function createEmployee(
  db: Db,
  input: EmployeeInput,
  actorId: string,
  effectiveDate?: Date,
): Promise<string> {
  await assertDocumentFree(db, input.documentId)
  return db.$transaction((tx) => insertEmployeeTx(tx, input, actorId, effectiveDate))
}

export async function updateEmployee(
  db: Db,
  id: string,
  input: EmployeeInput,
  actorId: string,
  effectiveDate?: Date,
): Promise<void> {
  const existing = await db.employee.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, documentId: true, categoryId: true, active: true },
  })
  if (!existing) throw new ActionError('NOT_FOUND', 'Empleado no encontrado.')

  if (input.documentId !== existing.documentId) await assertDocumentFree(db, input.documentId, id)

  const newCategoryId = input.categoryId || null
  const categoryChanged = existing.categoryId !== newCategoryId
  const activeChanged = existing.active !== input.active
  const eff = effectiveDate ?? todayWorkDate()

  // El horario efectivo depende de estar activo Y tener categoría. Suspender
  // (active:false) cierra los horarios; reactivar los reabre. Así una
  // suspensión NO genera ABSENT durante su vigencia, y el histórico previo se
  // conserva (versionado, no sobrescritura).
  const beforeSchedCat = schedulingCategory(existing.active, existing.categoryId)
  const afterSchedCat = schedulingCategory(input.active, newCategoryId)

  await db.$transaction(async (tx) => {
    await tx.employee.update({ where: { id }, data: { ...baseData(input), categoryId: newCategoryId } })

    if (beforeSchedCat !== afterSchedCat) {
      await versionSchedules(tx, { employeeId: id, newCategoryId: afterSchedCat, effectiveDate: eff })
    }

    if (categoryChanged) {
      await writeEmployeeAudit(tx, {
        action: 'update',
        employeeId: id,
        actorId,
        before: { categoryId: existing.categoryId },
        after: { categoryId: newCategoryId },
      })
    }
    if (activeChanged) {
      await writeEmployeeAudit(tx, {
        action: 'update',
        employeeId: id,
        actorId,
        before: { active: existing.active },
        after: { active: input.active },
      })
    }
  })
}

/** Baja = soft delete (deletedAt + active:false). Nunca hard delete. */
export async function softDeleteEmployee(
  db: Db,
  id: string,
  actorId: string,
  effectiveDate?: Date,
): Promise<void> {
  const existing = await db.employee.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, active: true },
  })
  if (!existing) throw new ActionError('NOT_FOUND', 'Empleado no encontrado.')

  await db.$transaction(async (tx) => {
    // La baja también cierra los horarios vigentes (record:false de ahí en más).
    await versionSchedules(tx, {
      employeeId: id,
      newCategoryId: null,
      effectiveDate: effectiveDate ?? todayWorkDate(),
    })
    await tx.employee.update({ where: { id }, data: { deletedAt: new Date(), active: false } })
    await writeEmployeeAudit(tx, {
      action: 'delete',
      employeeId: id,
      actorId,
      before: { active: existing.active, deletedAt: null },
      after: { active: false, deletedAt: 'set' },
    })
  })
}

export type EmployeeStatusFilter = 'all' | 'active' | 'inactive'

export interface ListEmployeesParams {
  page: number
  pageSize: number
  categoryId?: string
  status?: EmployeeStatusFilter
}

export async function listEmployees(db: Db, params: ListEmployeesParams) {
  const { page, pageSize, categoryId, status = 'all' } = params
  const where = {
    deletedAt: null, // siempre: las bajas no aparecen
    ...(categoryId ? { categoryId } : {}),
    ...(status === 'active' ? { active: true } : status === 'inactive' ? { active: false } : {}),
  }
  const [total, rows] = await Promise.all([
    db.employee.count({ where }),
    db.employee.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        documentId: true,
        position: true,
        employmentType: true,
        active: true,
        category: { select: { name: true } },
      },
    }),
  ])
  return { rows, total, page, pageSize }
}

export async function getEmployee(db: Db, id: string) {
  return db.employee.findFirst({
    where: { id, deletedAt: null },
    include: {
      category: { select: { id: true, name: true } },
      schedules: {
        where: { deletedAt: null, effectiveTo: null },
        orderBy: { dayOfWeek: 'asc' },
        select: { dayOfWeek: true, startMinute: true, endMinute: true, effectiveFrom: true },
      },
    },
  })
}
