import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { prisma } from '@/lib/db'
import type { PrismaClient } from '@/generated/prisma/client'
import { sweepAttendance, workDateFromKey, dowBA } from '@/lib/attendance'

/**
 * Tests de INTEGRACIÓN del barrido (pnpm test:int, tocan Postgres).
 */

// Ventana y día de prueba (calendario BA).
const FROM = '2026-08-01'
const TO = '2026-08-31'
const DAY = '2026-08-14'
const workDate = workDateFromKey(DAY)
const params = { from: workDateFromKey(FROM), to: workDateFromKey(TO) }

// Instantes del día (BA -03 en agosto -> +3 a UTC).
const at = (hhmm: string) => new Date(`${DAY}T${hhmm}:00.000-03:00`)

async function clean() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE attendance, audit_log, event_assignment, time_entry, work_schedule, leave_request, event, holiday, employee RESTART IDENTITY CASCADE',
  )
}

let dni = 0
async function makeEmployee() {
  dni++
  return prisma.employee.create({
    data: { firstName: 'Test', lastName: `E${dni}`, documentId: `TST${dni}`, active: true },
    select: { id: true },
  })
}

async function makeEvent() {
  return prisma.event.create({
    data: { name: `Ev${dni}`, startAt: at('08:00'), endAt: at('18:00'), status: 'CONFIRMED' },
    select: { id: true },
  })
}

beforeEach(async () => {
  await clean()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('barrido con ventana móvil', () => {
  it('un día UNVERIFIED se resuelve a PRESENT cuando la asignación pasa a COMPLETED (RAZÓN DE SER de la ventana)', async () => {
    const emp = await makeEmployee()
    const ev = await makeEvent()
    const asg = await prisma.eventAssignment.create({
      data: {
        eventId: ev.id,
        employeeId: emp.id,
        workDate,
        startAt: at('08:00'),
        endAt: at('18:00'),
        status: 'CONFIRMED', // sin fichada + no confirmada
      },
      select: { id: true },
    })

    // Barrido 1: sin evidencia -> UNVERIFIED
    const s1 = await sweepAttendance(prisma, params)
    expect(s1.unverifiedRemaining).toBe(1)
    const a1 = await prisma.attendance.findFirstOrThrow({ where: { employeeId: emp.id, workDate } })
    expect(a1.status).toBe('UNVERIFIED')

    // Dos días después el supervisor la marca COMPLETED...
    await prisma.eventAssignment.update({ where: { id: asg.id }, data: { status: 'COMPLETED' } })

    // Barrido 2 sobre la MISMA ventana: recalcula el día viejo -> PRESENT
    const s2 = await sweepAttendance(prisma, params)
    expect(s2.unverifiedRemaining).toBe(0)
    const a2 = await prisma.attendance.findFirstOrThrow({ where: { employeeId: emp.id, workDate } })
    expect(a2.status).toBe('PRESENT')
    expect(a2.workedMinutes).toBe(600) // confirmado por supervisor
    expect(a2.warnings).toContain('SIN_FICHADA_CONFIRMADO_POR_SUPERVISOR')
  })

  it('fila MANUAL/JUSTIFIED: el status sobrevive al recálculo y workedMinutes se actualiza', async () => {
    const emp = await makeEmployee()
    // Horario habitual 09-17 el día DAY
    await prisma.workSchedule.create({
      data: {
        employeeId: emp.id,
        dayOfWeek: dowBA(DAY),
        startMinute: 540,
        endMinute: 1020,
        effectiveFrom: workDateFromKey('2026-01-01'),
      },
    })
    // Fila MANUAL cargada por el admin: JUSTIFIED, sin minutos aún
    await prisma.attendance.create({
      data: { employeeId: emp.id, workDate, status: 'JUSTIFIED', source: 'MANUAL', workedMinutes: 0 },
    })
    // Aparece una fichada después
    await prisma.timeEntry.create({
      data: { employeeId: emp.id, workDate, checkIn: at('09:00'), checkOut: at('13:00'), source: 'MANUAL' },
    })

    await sweepAttendance(prisma, params)

    const row = await prisma.attendance.findFirstOrThrow({ where: { employeeId: emp.id, workDate } })
    expect(row.status).toBe('JUSTIFIED') // el status manual sobrevive
    expect(row.source).toBe('MANUAL')
    expect(row.workedMinutes).toBe(240) // pero los minutos SE refrescan

    // status no cambió -> no se audita ESE día (los otros días del mismo
    // weekday sí generan ABSENT + audit, eso es correcto; por eso se scopea).
    const audits = await prisma.auditLog.count({
      where: { domain: 'ATTENDANCE', entityId: `${emp.id}:${DAY}` },
    })
    expect(audits).toBe(0)
  })

  it('idempotencia: correr el barrido dos veces no cambia nada ni duplica AuditLog', async () => {
    const emp = await makeEmployee()
    const ev = await makeEvent()
    await prisma.eventAssignment.create({
      data: { eventId: ev.id, employeeId: emp.id, workDate, startAt: at('08:00'), endAt: at('18:00'), status: 'COMPLETED' },
    })

    const s1 = await sweepAttendance(prisma, params)
    expect(s1.writes.created).toBe(1)
    const row1 = await prisma.attendance.findFirstOrThrow({ where: { employeeId: emp.id, workDate } })
    const audits1 = await prisma.auditLog.count()

    const s2 = await sweepAttendance(prisma, params)
    expect(s2.writes).toEqual({ created: 0, updated: 0, deleted: 0, noop: s2.days })
    const row2 = await prisma.attendance.findFirstOrThrow({ where: { employeeId: emp.id, workDate } })
    const audits2 = await prisma.auditLog.count()

    expect(row2.updatedAt.getTime()).toBe(row1.updatedAt.getTime()) // ni un UPDATE
    expect(audits2).toBe(audits1) // ni un AuditLog nuevo
  })

  it('sin N+1: el barrido no-op no escala en queries con la cantidad de empleados', async () => {
    // Helper: cuenta operaciones Prisma vía extensión.
    let ops = 0
    const counting = prisma.$extends({
      query: {
        $allModels: {
          async $allOperations({ args, query }) {
            ops++
            return query(args)
          },
        },
      },
    }) as unknown as PrismaClient

    async function seedEmployeeWithData() {
      const emp = await makeEmployee()
      const ev = await makeEvent()
      await prisma.eventAssignment.create({
        data: { eventId: ev.id, employeeId: emp.id, workDate, startAt: at('08:00'), endAt: at('18:00'), status: 'COMPLETED' },
      })
    }

    // 1 empleado, poblar, y medir una corrida NO-OP.
    await seedEmployeeWithData()
    await sweepAttendance(prisma, params)
    ops = 0
    await sweepAttendance(counting, params)
    const opsCon1 = ops

    // 4 empleados más (5 total), poblar, y medir de nuevo NO-OP.
    for (let i = 0; i < 4; i++) await seedEmployeeWithData()
    await sweepAttendance(prisma, params)
    ops = 0
    await sweepAttendance(counting, params)
    const opsCon5 = ops

    // Mismas queries con 1 o con 5 empleados: NO escala (no hay N+1).
    expect(opsCon5).toBe(opsCon1)
    expect(opsCon1).toBeLessThan(12) // bulk fetch acotado (~7)
  })
})
