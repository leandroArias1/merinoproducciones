import type { PrismaClient } from '@/generated/prisma/client'
import { ActionError } from '@/lib/auth/action'
import type { CategoryInput } from './schema'

type Db = PrismaClient

export interface CategoryListItem {
  id: string
  name: string
  description: string | null
  days: { dayOfWeek: number; startMinute: number; endMinute: number }[]
  employeeCount: number
}

export async function listCategories(db: Db): Promise<CategoryListItem[]> {
  const [cats, counts] = await Promise.all([
    db.employeeCategory.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      include: {
        days: {
          where: { deletedAt: null },
          orderBy: { dayOfWeek: 'asc' },
          select: { dayOfWeek: true, startMinute: true, endMinute: true },
        },
      },
    }),
    db.employee.groupBy({
      by: ['categoryId'],
      where: { deletedAt: null, categoryId: { not: null } },
      _count: { _all: true },
    }),
  ])
  const countByCat = new Map(counts.map((c) => [c.categoryId, c._count._all]))
  return cats.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    days: c.days,
    employeeCount: countByCat.get(c.id) ?? 0,
  }))
}

export async function getCategory(db: Db, id: string) {
  // findFirst + deletedAt:null (NUNCA findUnique: el unique de name es parcial;
  // acá vamos por id, pero mantenemos el filtro de borrado por consistencia).
  return db.employeeCategory.findFirst({
    where: { id, deletedAt: null },
    include: {
      days: {
        where: { deletedAt: null },
        orderBy: { dayOfWeek: 'asc' },
        select: { dayOfWeek: true, startMinute: true, endMinute: true },
      },
    },
  })
}

async function assertNameFree(db: Db, name: string, exceptId?: string): Promise<void> {
  // findFirst, NO findUnique: EmployeeCategory.name es unique PARCIAL.
  const clash = await db.employeeCategory.findFirst({
    where: { name, deletedAt: null, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true },
  })
  if (clash) throw new ActionError('CONFLICT', `Ya existe una categoría "${name}".`)
}

export async function createCategory(db: Db, input: CategoryInput): Promise<string> {
  await assertNameFree(db, input.name)
  const cat = await db.$transaction(async (tx) => {
    const created = await tx.employeeCategory.create({
      data: { name: input.name, description: input.description || null },
      select: { id: true },
    })
    await tx.categoryDay.createMany({
      data: input.days.map((d) => ({ categoryId: created.id, ...d })),
    })
    return created
  })
  return cat.id
}

export async function updateCategory(db: Db, id: string, input: CategoryInput): Promise<void> {
  const existing = await db.employeeCategory.findFirst({ where: { id, deletedAt: null }, select: { id: true } })
  if (!existing) throw new ActionError('NOT_FOUND', 'Categoría no encontrada.')
  await assertNameFree(db, input.name, id)

  await db.$transaction(async (tx) => {
    await tx.employeeCategory.update({
      where: { id },
      data: { name: input.name, description: input.description || null },
    })
    // Reemplazo de plantilla: se descartan los tramos viejos (soft delete) y se
    // crean los nuevos. Los WorkSchedule ya generados NO se tocan (eso lo hace
    // el versionado al cambiar la categoría de un empleado).
    await tx.categoryDay.updateMany({
      where: { categoryId: id, deletedAt: null },
      data: { deletedAt: new Date() },
    })
    await tx.categoryDay.createMany({ data: input.days.map((d) => ({ categoryId: id, ...d })) })
  })
}

export async function deleteCategory(db: Db, id: string): Promise<void> {
  const inUse = await db.employee.count({ where: { categoryId: id, deletedAt: null } })
  if (inUse > 0) {
    throw new ActionError('CONFLICT', `No se puede borrar: ${inUse} empleado(s) usan esta categoría.`)
  }
  await db.$transaction(async (tx) => {
    await tx.categoryDay.updateMany({ where: { categoryId: id, deletedAt: null }, data: { deletedAt: new Date() } })
    await tx.employeeCategory.update({ where: { id }, data: { deletedAt: new Date() } })
  })
}
