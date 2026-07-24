import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { prisma } from '@/lib/db'
import { clockIn, clockOut, todayStateFor, supervisorToggle } from '@/lib/timeentry/fichaje'
import { createEvent } from '@/lib/events/events'
import { createAssignment } from '@/lib/events/assignments'
import { workDateFromKey, dowBA } from '@/lib/attendance'

const ACTOR = 'admin-user-id'

async function clean() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "user", account, session, employee_category, category_day, employee, work_schedule, attendance, audit_log, event_assignment, time_entry, leave_request, event, holiday RESTART IDENTITY CASCADE',
  )
}
async function makeEmployee(documentId: string) {
  return prisma.employee.create({
    data: { firstName: 'E', lastName: documentId, documentId, active: true },
    select: { id: true },
  })
}

// Día con horario 09:00–13:00 (240 min) para que el fichaje complete PRESENT.
const KEY = '2026-08-14'
const W = dowBA(KEY)
async function withSchedule(employeeId: string) {
  await prisma.workSchedule.create({
    data: {
      employeeId,
      dayOfWeek: W,
      startMinute: 540,
      endMinute: 780, // 13:00
      effectiveFrom: workDateFromKey('2026-01-01'),
    },
  })
}
const t = (hhmm: string) => new Date(`${KEY}T${hhmm}:00-03:00`)

beforeEach(async () => {
  await clean()
  await prisma.user.create({ data: { id: ACTOR, email: 'a@t.com', name: 'A', role: 'ADMIN' } })
})
afterAll(async () => {
  await prisma.$disconnect()
})

describe('fichaje del empleado', () => {
  it('doble "fichar entrada" NO crea dos entradas abiertas', async () => {
    const e = await makeEmployee('30111222')
    await clockIn(prisma, { employeeId: e.id, actorId: ACTOR, source: 'DEVICE', location: null }, t('09:00'))
    await expect(
      clockIn(prisma, { employeeId: e.id, actorId: ACTOR, source: 'DEVICE', location: null }, t('09:05')),
    ).rejects.toMatchObject({ code: 'CONFLICT' })

    const abiertas = await prisma.timeEntry.count({ where: { employeeId: e.id, checkOut: null, deletedAt: null } })
    expect(abiertas).toBe(1)
  })

  it('la hora guardada es la del SERVIDOR (el parámetro now), no la del cliente', async () => {
    const e = await makeEmployee('30111222')
    const serverNow = t('09:00')
    const id = await clockIn(prisma, { employeeId: e.id, actorId: ACTOR, source: 'DEVICE', location: null }, serverNow)
    const row = await prisma.timeEntry.findFirstOrThrow({ where: { id } })
    // El cliente no tiene forma de pasar la hora: se guarda exactamente `now`.
    expect(row.checkIn.toISOString()).toBe(serverNow.toISOString())
  })

  it('fichada SIN permiso de ubicación se guarda igual (denied)', async () => {
    const e = await makeEmployee('30111222')
    const id = await clockIn(
      prisma,
      { employeeId: e.id, actorId: ACTOR, source: 'DEVICE', location: { denied: true } },
      t('06:00'),
    )
    const row = await prisma.timeEntry.findFirstOrThrow({ where: { id } })
    expect(row.checkInLocationDenied).toBe(true)
    expect(row.checkInLat).toBeNull()
  })

  it('entrada + salida → Attendance PRESENT con los minutos correctos, sin cron', async () => {
    const e = await makeEmployee('30111222')
    await withSchedule(e.id)

    await clockIn(prisma, { employeeId: e.id, actorId: ACTOR, source: 'DEVICE', location: null }, t('09:00'))
    // El botón refleja el estado real.
    expect((await todayStateFor(prisma, e.id, t('10:00'))).nextAction).toBe('salida')
    await clockOut(prisma, { employeeId: e.id, actorId: ACTOR, location: null }, t('13:00'))

    const att = await prisma.attendance.findFirstOrThrow({ where: { employeeId: e.id, workDate: workDateFromKey(KEY) } })
    expect(att.status).toBe('PRESENT')
    expect(att.workedMinutes).toBe(240)
  })

  it('guarda la ubicación cuando el navegador la da', async () => {
    const e = await makeEmployee('30111222')
    const id = await clockIn(
      prisma,
      { employeeId: e.id, actorId: ACTOR, source: 'DEVICE', location: { lat: -34.6, lng: -58.4, accuracy: 12 } },
      t('06:00'),
    )
    const row = await prisma.timeEntry.findFirstOrThrow({ where: { id } })
    expect(row.checkInLat).toBeCloseTo(-34.6)
    expect(row.checkInLocationDenied).toBe(false)
  })
})

describe('fichaje del supervisor por el grupo', () => {
  async function eventWithSupervisor() {
    const sup = await makeEmployee('30000001')
    const member = await makeEmployee('30000002')
    const eventId = await createEvent(
      prisma,
      { name: 'Ev', client: '', venue: '', startAt: '2026-08-14T08:00', endAt: '2026-08-14T18:00' },
      ACTOR,
    )
    // sup es supervisor del evento
    await createAssignment(
      prisma,
      eventId,
      { employeeId: sup.id, role: 'Armado', isSupervisor: true, startAt: '2026-08-14T08:00', endAt: '2026-08-14T18:00' },
      ACTOR,
    )
    await createAssignment(
      prisma,
      eventId,
      { employeeId: member.id, role: 'Armado', isSupervisor: false, startAt: '2026-08-14T08:00', endAt: '2026-08-14T18:00' },
      ACTOR,
    )
    return { sup, member, eventId }
  }

  it('el supervisor ficha a un miembro de SU evento', async () => {
    const { sup, member, eventId } = await eventWithSupervisor()
    const r = await supervisorToggle(
      prisma,
      { supervisorEmployeeId: sup.id, supervisorUserId: ACTOR, eventId, memberEmployeeId: member.id, location: null },
      t('08:00'),
    )
    expect(r).toBe('entrada')
    const row = await prisma.timeEntry.findFirstOrThrow({ where: { employeeId: member.id } })
    expect(row.editedById).toBe(ACTOR) // queda registrado quién fichó
  })

  it('un supervisor NO puede fichar en una asignación/evento ajeno', async () => {
    const { member, eventId } = await eventWithSupervisor()
    const ajeno = await makeEmployee('30000009') // no es supervisor de ese evento
    await expect(
      supervisorToggle(
        prisma,
        { supervisorEmployeeId: ajeno.id, supervisorUserId: ACTOR, eventId, memberEmployeeId: member.id, location: null },
        t('08:00'),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
