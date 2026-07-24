import type { PrismaClient } from '@/generated/prisma/client'
import { dateKey } from './timezone'

type Db = PrismaClient

export interface DayRow {
  employeeId: string
  employeeName: string
  attendanceId: string | null
  status: string | null
  workedMinutes: number
  warnings: string[]
  source: string | null
  firstCheckIn: Date | null
  lastCheckOut: Date | null
  hasOpen: boolean
  entries: { id: string; checkIn: Date; checkOut: Date | null; source: string }[]
}

/**
 * Tabla diaria: una fila por empleado con Attendance del día + sus fichadas
 * (entrada/salida). Sin N+1: 2 queries (attendance + time_entry) agrupadas.
 */
export async function dailyAttendance(
  db: Db,
  args: { workDate: Date; status?: string; employeeId?: string },
): Promise<DayRow[]> {
  const where = {
    workDate: args.workDate,
    ...(args.status ? { status: args.status as never } : {}),
    ...(args.employeeId ? { employeeId: args.employeeId } : {}),
  }
  const [attendance, entries] = await Promise.all([
    db.attendance.findMany({
      where,
      include: { employee: { select: { firstName: true, lastName: true } } },
      orderBy: { employee: { lastName: 'asc' } },
    }),
    db.timeEntry.findMany({
      where: {
        workDate: args.workDate,
        deletedAt: null,
        ...(args.employeeId ? { employeeId: args.employeeId } : {}),
      },
      orderBy: { checkIn: 'asc' },
      select: { id: true, employeeId: true, checkIn: true, checkOut: true, source: true },
    }),
  ])

  const byEmp = new Map<string, typeof entries>()
  for (const e of entries) {
    const arr = byEmp.get(e.employeeId) ?? []
    arr.push(e)
    byEmp.set(e.employeeId, arr)
  }

  return attendance.map((a) => {
    const es = byEmp.get(a.employeeId) ?? []
    const closed = es.filter((e) => e.checkOut)
    return {
      employeeId: a.employeeId,
      employeeName: `${a.employee.lastName}, ${a.employee.firstName}`,
      attendanceId: a.id,
      status: a.status,
      workedMinutes: a.workedMinutes,
      warnings: a.warnings,
      source: a.source,
      firstCheckIn: es[0]?.checkIn ?? null,
      lastCheckOut: closed.length ? closed[closed.length - 1].checkOut : null,
      hasOpen: es.some((e) => !e.checkOut),
      entries: es.map((e) => ({ id: e.id, checkIn: e.checkIn, checkOut: e.checkOut, source: e.source })),
    }
  })
}

const REVIEW_WHERE = {
  OR: [{ status: { in: ['UNVERIFIED', 'INCOMPLETE'] as never } }, { warnings: { isEmpty: false } }],
}

/** DÍAS A REVISAR: UNVERIFIED, INCOMPLETE o con warnings. Lo que traba payroll. */
export async function reviewList(db: Db, args?: { from?: Date; to?: Date }) {
  const rows = await db.attendance.findMany({
    where: {
      ...REVIEW_WHERE,
      ...(args?.from || args?.to ? { workDate: { ...(args.from ? { gte: args.from } : {}), ...(args.to ? { lte: args.to } : {}) } } : {}),
    },
    include: { employee: { select: { firstName: true, lastName: true } } },
    orderBy: [{ workDate: 'desc' }, { employee: { lastName: 'asc' } }],
    take: 200,
  })
  return rows.map((a) => ({
    attendanceId: a.id,
    employeeId: a.employeeId,
    employeeName: `${a.employee.lastName}, ${a.employee.firstName}`,
    workDateKey: dateKey(a.workDate),
    status: a.status,
    workedMinutes: a.workedMinutes,
    warnings: a.warnings,
  }))
}

/** Contador para el dashboard. */
export async function reviewCount(db: Db): Promise<number> {
  return db.attendance.count({ where: REVIEW_WHERE })
}
