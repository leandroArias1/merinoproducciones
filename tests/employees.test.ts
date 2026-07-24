import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { prisma } from '@/lib/db'
import { ActionError } from '@/lib/auth/action'
import { createCategory } from '@/lib/employees/categories'
import { createEmployee, updateEmployee, softDeleteEmployee } from '@/lib/employees/employees'
import { recalculate, workDateFromKey, dowBA } from '@/lib/attendance'
import type { EmployeeInput } from '@/lib/employees/schema'

const ACTOR = 'admin-user-id'

async function clean() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "user", account, session, employee_category, category_day, employee, work_schedule, attendance, audit_log, event_assignment, time_entry, leave_request, event, holiday RESTART IDENTITY CASCADE',
  )
}

function emp(over: Partial<EmployeeInput>): EmployeeInput {
  return {
    firstName: 'Test',
    lastName: 'Empleado',
    documentId: '30000001',
    email: '',
    phone: '',
    position: '',
    employmentType: 'MONTHLY',
    hireDate: '',
    categoryId: '',
    active: true,
    ...over,
  }
}

// Categorías: W = un mismo día de la semana para pre y post del cambio.
const PRE = '2026-08-07'
const CHANGE = '2026-08-14'
const W = dowBA(PRE) // dowBA(PRE) === dowBA(CHANGE) (7 días exactos)

async function catMediaJornada() {
  return createCategory(prisma, {
    name: 'Media jornada',
    description: '',
    days: [{ dayOfWeek: W, startMinute: 540, endMinute: 840 }], // 09:00-14:00 = 300
  })
}
async function catCompleta() {
  return createCategory(prisma, {
    name: 'Jornada completa',
    description: '',
    days: [{ dayOfWeek: W, startMinute: 540, endMinute: 1020 }], // 09:00-17:00 = 480
  })
}

beforeEach(async () => {
  await clean()
  // El actorId de AuditLog referencia user(id): sembramos un admin real.
  await prisma.user.create({ data: { id: ACTOR, email: 'admin@test.com', name: 'Admin', role: 'ADMIN' } })
})
afterAll(async () => {
  await prisma.$disconnect()
})

describe('documentId: unique parcial (re-contratación)', () => {
  it('alta con DNI de alguien ACTIVO falla con mensaje claro', async () => {
    await createEmployee(prisma, emp({ documentId: '30111222' }), ACTOR)
    await expect(createEmployee(prisma, emp({ documentId: '30111222' }), ACTOR)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('alta con DNI de alguien DADO DE BAJA funciona (re-contratación)', async () => {
    const id = await createEmployee(prisma, emp({ documentId: '30111222', firstName: 'Viejo' }), ACTOR)
    await softDeleteEmployee(prisma, id, ACTOR)
    // mismo DNI, ahora libre porque el viejo tiene deletedAt
    const nuevo = await createEmployee(prisma, emp({ documentId: '30111222', firstName: 'Nuevo' }), ACTOR)
    const row = await prisma.employee.findFirstOrThrow({ where: { documentId: '30111222', deletedAt: null } })
    expect(row.id).toBe(nuevo)
    expect(row.firstName).toBe('Nuevo')
  })
})

describe('versionado de horarios al cambiar de categoría', () => {
  it('un barrido en fecha ANTERIOR al cambio sigue usando el horario VIEJO', async () => {
    const media = await catMediaJornada()
    const completa = await catCompleta()

    // Alta con Media jornada, vigente desde mucho antes.
    const id = await createEmployee(
      prisma,
      emp({ categoryId: media, hireDate: '2026-01-01' }),
      ACTOR,
      workDateFromKey('2026-01-01'),
    )

    // Cambia a Jornada completa el día CHANGE.
    await updateEmployee(
      prisma,
      id,
      emp({ categoryId: completa, hireDate: '2026-01-01' }),
      ACTOR,
      workDateFromKey(CHANGE),
    )

    // Horarios: el viejo se cerró (effectiveTo = día anterior), el nuevo abrió.
    const schedules = await prisma.workSchedule.findMany({
      where: { employeeId: id, deletedAt: null },
      orderBy: { effectiveFrom: 'asc' },
    })
    expect(schedules).toHaveLength(2)
    expect(schedules[0].effectiveTo?.toISOString().slice(0, 10)).toBe('2026-08-13') // día anterior
    expect(schedules[1].effectiveFrom.toISOString().slice(0, 10)).toBe(CHANGE)

    // Barrido en PRE (antes del cambio) -> horario VIEJO (300 min), NO el nuevo.
    await recalculate(prisma, id, workDateFromKey(PRE))
    const pre = await prisma.attendance.findFirstOrThrow({ where: { employeeId: id, workDate: workDateFromKey(PRE) } })
    expect(pre.status).toBe('ABSENT')
    expect(pre.expectedMinutes).toBe(300) // Media jornada, el histórico NO se reescribió

    // Barrido en CHANGE -> horario NUEVO (480 min).
    await recalculate(prisma, id, workDateFromKey(CHANGE))
    const post = await prisma.attendance.findFirstOrThrow({ where: { employeeId: id, workDate: workDateFromKey(CHANGE) } })
    expect(post.expectedMinutes).toBe(480)
  })
})

describe('suspensión versiona horarios (no genera ABSENT)', () => {
  it('suspender cierra los horarios: el barrido sobre el período NO genera registro', async () => {
    const media = await catMediaJornada()
    const id = await createEmployee(
      prisma,
      emp({ categoryId: media, hireDate: '2026-01-01' }),
      ACTOR,
      workDateFromKey('2026-01-01'),
    )

    // Suspende (active:false) desde el día del cambio.
    await updateEmployee(
      prisma,
      id,
      emp({ categoryId: media, active: false }),
      ACTOR,
      workDateFromKey(CHANGE),
    )

    // No quedan horarios vigentes (effectiveTo null) desde el cambio.
    const vigentes = await prisma.workSchedule.findMany({
      where: { employeeId: id, deletedAt: null, effectiveTo: null },
    })
    expect(vigentes).toHaveLength(0)

    // Barrido en un día del período de suspensión (>= CHANGE) -> sin registro.
    const accion = await recalculate(prisma, id, workDateFromKey(CHANGE))
    expect(accion).toBe('noop') // record:false, no crea Attendance
    const count = await prisma.attendance.count({ where: { employeeId: id } })
    expect(count).toBe(0)

    // Antes del cambio, el horario viejo sigue -> ABSENT (histórico intacto).
    await recalculate(prisma, id, workDateFromKey(PRE))
    const pre = await prisma.attendance.findFirstOrThrow({ where: { employeeId: id, workDate: workDateFromKey(PRE) } })
    expect(pre.status).toBe('ABSENT')
  })
})

describe('auditoría', () => {
  it('cambio de categoría y de estado escriben AuditLog con actorId real', async () => {
    const media = await catMediaJornada()
    const completa = await catCompleta()
    const id = await createEmployee(prisma, emp({ categoryId: media }), ACTOR, workDateFromKey('2026-01-01'))

    await updateEmployee(
      prisma,
      id,
      emp({ categoryId: completa, active: false }), // cambia categoría Y estado
      ACTOR,
      workDateFromKey(CHANGE),
    )

    const audits = await prisma.auditLog.findMany({
      where: { domain: 'EMPLOYEE', entityType: 'Employee', entityId: id },
      orderBy: { createdAt: 'asc' },
    })
    // alta(categoría) + cambio de categoría + cambio de estado
    const cambios = audits.map((a) => ({ before: a.before, after: a.after, actor: a.actorId }))
    expect(cambios.some((c) => JSON.stringify(c.after) === JSON.stringify({ categoryId: completa }))).toBe(true)
    expect(cambios.some((c) => JSON.stringify(c.after) === JSON.stringify({ active: false }))).toBe(true)
    expect(audits.every((a) => a.actorId === ACTOR)).toBe(true)
  })
})

describe('categoría: turno partido bloqueado por schema (zod)', () => {
  it('no se puede crear una categoría con dos tramos el mismo día', async () => {
    const { categorySchema } = await import('@/lib/employees/schema')
    const parsed = categorySchema.safeParse({
      name: 'Partida',
      days: [
        { dayOfWeek: 1, startMinute: 540, endMinute: 720 },
        { dayOfWeek: 1, startMinute: 840, endMinute: 1020 },
      ],
    })
    expect(parsed.success).toBe(false)
  })
})
