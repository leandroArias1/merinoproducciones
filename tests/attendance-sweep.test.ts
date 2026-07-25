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

  it('REGRESIÓN bug #1: barrido con MUCHOS días accionables (35) termina OK y escribe todo, con chunk chico', async () => {
    // Ventana ancha de 35 días.
    const F = '2026-09-01'
    const T = '2026-10-05'
    const wide = { from: workDateFromKey(F), to: workDateFromKey(T), chunkSize: 5 }

    // Empleado que trabaja TODOS los días (un WorkSchedule por día de la semana)
    // => cada día de la ventana es accionable (ABSENT sin fichada).
    const emp = await makeEmployee()
    for (let dow = 0; dow < 7; dow++) {
      await prisma.workSchedule.create({
        data: {
          employeeId: emp.id,
          dayOfWeek: dow,
          startMinute: 540,
          endMinute: 1020,
          effectiveFrom: workDateFromKey('2026-01-01'),
        },
      })
    }

    // Con chunkSize 5 y 35 días => 7 transacciones. Antes del arreglo, todo caía
    // en UNA transacción y sobre el pooler reventaba el timeout (bug #1).
    const s = await sweepAttendance(prisma, wide)

    expect(s.days).toBe(35)
    expect(s.writes.created).toBe(35) // escribió TODOS
    const count = await prisma.attendance.count({ where: { employeeId: emp.id } })
    expect(count).toBe(35)

    // Idempotente incluso en volumen: segunda corrida no reescribe nada.
    const s2 = await sweepAttendance(prisma, wide)
    expect(s2.writes).toEqual({ created: 0, updated: 0, deleted: 0, noop: 35 })
  })

  it('createMany: 200+ altas se escriben todas con statements ACOTADOS (holgado bajo 60s)', async () => {
    const F = '2026-09-01'
    const T = '2027-04-01' // ~213 días
    const wide = { from: workDateFromKey(F), to: workDateFromKey(T), chunkSize: 25 }

    const emp = await makeEmployee()
    for (let dow = 0; dow < 7; dow++) {
      await prisma.workSchedule.create({
        data: { employeeId: emp.id, dayOfWeek: dow, startMinute: 540, endMinute: 1020, effectiveFrom: workDateFromKey('2026-01-01') },
      })
    }

    // Cuenta operaciones Prisma por modelo+operación.
    const counts = { create: 0, createMany: 0, total: 0 }
    const counting = prisma.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            counts.total++
            if (model === 'Attendance' && operation === 'create') counts.create++
            if (model === 'Attendance' && operation === 'createMany') counts.createMany++
            return query(args)
          },
        },
      },
    }) as unknown as PrismaClient

    const s = await sweepAttendance(counting, wide)

    expect(s.writes.created).toBeGreaterThanOrEqual(200)
    expect(s.writes.created).toBe(s.days) // todos los días son alta (ABSENT sin fichada)
    expect(await prisma.attendance.count({ where: { employeeId: emp.id } })).toBe(s.days)

    // La clave del arreglo: NINGUNA alta fila-por-fila; todo por createMany.
    expect(counts.create).toBe(0)
    expect(counts.createMany).toBeGreaterThan(0)
    // Statements ACOTADOS: O(lotes), no O(filas). ~213 altas / chunk 25 ≈ 9 lotes
    // => ~9 createMany(att) + 9 createMany(audit) + ~7 lecturas ≈ 25 ops. Muy por
    // debajo de 2*213=426 del path viejo. A ~145ms/statement en prod ≈ ~5s (<<60s).
    expect(counts.total).toBeLessThan(40)

    // Idempotente a volumen: 2da corrida no reescribe nada.
    const s2 = await sweepAttendance(prisma, wide)
    expect(s2.writes).toEqual({ created: 0, updated: 0, deleted: 0, noop: s2.days })
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
