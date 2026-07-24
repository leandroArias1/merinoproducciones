import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { prisma } from '@/lib/db'
import { createEvent, setEventStatus, canSupervisorAccessEvent } from '@/lib/events/events'
import {
  createAssignment,
  setAssignmentStatus,
  checkAssignmentConflicts,
} from '@/lib/events/assignments'
import { baLocalToInstant } from '@/lib/events/time'

const ACTOR = 'admin-user-id'

async function clean() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "user", account, session, employee_category, category_day, employee, work_schedule, attendance, audit_log, event_assignment, time_entry, leave_request, event, holiday RESTART IDENTITY CASCADE',
  )
}

async function makeEmployee(documentId: string, firstName = 'Emp') {
  return prisma.employee.create({
    data: { firstName, lastName: 'X', documentId, active: true },
    select: { id: true },
  })
}

// Turno de show 20:00–00:00 del 14/08 (workDate = 14). Sin fichadas.
const SHOW_START = '2026-08-14T20:00'
const SHOW_END = '2026-08-15T00:00'
const WORKDATE = new Date('2026-08-14T00:00:00.000Z')

beforeEach(async () => {
  await clean()
  await prisma.user.create({ data: { id: ACTOR, email: 'a@t.com', name: 'A', role: 'ADMIN' } })
})
afterAll(async () => {
  await prisma.$disconnect()
})

async function makeEventWithAssignment(employeeId: string, isSupervisor = false) {
  const eventId = await createEvent(
    prisma,
    { name: 'Festival', client: '', venue: '', startAt: '2026-08-14T08:00', endAt: SHOW_END },
    ACTOR,
  )
  const assignmentId = await createAssignment(
    prisma,
    eventId,
    { employeeId, role: 'Show', isSupervisor, startAt: SHOW_START, endAt: SHOW_END },
    ACTOR,
  )
  return { eventId, assignmentId }
}

describe('E2E: UNVERIFIED → COMPLETED → PRESENT sin esperar al cron', () => {
  it('marcar la asignación COMPLETED recalcula y deja el día en PRESENT', async () => {
    const emp = await makeEmployee('30111222')
    const { assignmentId } = await makeEventWithAssignment(emp.id)

    // Al crear la asignación (PLANNED, sin fichada) ya se recalculó -> UNVERIFIED.
    const a1 = await prisma.attendance.findFirstOrThrow({ where: { employeeId: emp.id, workDate: WORKDATE } })
    expect(a1.status).toBe('UNVERIFIED')

    // Marcar COMPLETED (lo que haría el supervisor desde la UI).
    await setAssignmentStatus(prisma, assignmentId, 'COMPLETED', ACTOR)

    const a2 = await prisma.attendance.findFirstOrThrow({ where: { employeeId: emp.id, workDate: WORKDATE } })
    expect(a2.status).toBe('PRESENT')
    expect(a2.workedMinutes).toBe(240) // confirmado por supervisor
  })
})

describe('cancelar el evento propaga CANCELLED y recalcula', () => {
  it('cancelar el evento cancela las asignaciones y limpia la expectativa del día', async () => {
    const emp = await makeEmployee('30111222')
    const { eventId, assignmentId } = await makeEventWithAssignment(emp.id)
    expect((await prisma.attendance.findFirst({ where: { employeeId: emp.id } }))?.status).toBe('UNVERIFIED')

    await setEventStatus(prisma, eventId, 'CANCELLED', ACTOR)

    const asg = await prisma.eventAssignment.findFirstOrThrow({ where: { id: assignmentId } })
    expect(asg.status).toBe('CANCELLED')
    // Sin expectativa (asignación cancelada, sin horario habitual) -> sin registro.
    const att = await prisma.attendance.count({ where: { employeeId: emp.id, workDate: WORKDATE } })
    expect(att).toBe(0)
  })
})

describe('permisos: supervisor no accede a evento ajeno', () => {
  it('canSupervisorAccessEvent true solo para el supervisor asignado', async () => {
    const supA = await makeEmployee('30111222', 'SupA')
    const supB = await makeEmployee('30222333', 'SupB')
    const { eventId } = await makeEventWithAssignment(supA.id, true) // A es supervisor

    expect(await canSupervisorAccessEvent(prisma, supA.id, eventId)).toBe(true)
    expect(await canSupervisorAccessEvent(prisma, supB.id, eventId)).toBe(false)
  })
})

describe('conflictos: se avisan (turnos solapados y licencia)', () => {
  it('detecta un turno solapado y una licencia aprobada', async () => {
    const emp = await makeEmployee('30111222')
    await makeEventWithAssignment(emp.id) // ya tiene el show 20:00–00:00

    // Licencia aprobada el 14/08
    await prisma.leaveRequest.create({
      data: {
        employeeId: emp.id,
        type: 'VACATION',
        status: 'APPROVED',
        dateFrom: new Date('2026-08-14T00:00:00Z'),
        dateTo: new Date('2026-08-14T00:00:00Z'),
      },
    })

    // Nuevo turno 22:00–23:00 del 14 (solapa con el show).
    const report = await checkAssignmentConflicts(prisma, {
      employeeId: emp.id,
      startAt: baLocalToInstant('2026-08-14T22:00'),
      endAt: baLocalToInstant('2026-08-14T23:00'),
    })
    expect(report.overlaps).toHaveLength(1)
    expect(report.overlaps[0].role).toBe('Show')
    expect(report.leave?.type).toBe('VACATION')
  })
})

describe('auditoría de status con actorId real', () => {
  it('cambios de status de evento y asignación se auditan', async () => {
    const emp = await makeEmployee('30111222')
    const { eventId, assignmentId } = await makeEventWithAssignment(emp.id)

    await setEventStatus(prisma, eventId, 'CONFIRMED', ACTOR)
    await setAssignmentStatus(prisma, assignmentId, 'CONFIRMED', ACTOR)

    const evAudit = await prisma.auditLog.findFirst({
      where: { domain: 'EVENT', entityId: eventId, action: 'status' },
    })
    const asAudit = await prisma.auditLog.findFirst({
      where: { domain: 'ASSIGNMENT', entityId: assignmentId, action: 'status' },
    })
    expect(evAudit?.actorId).toBe(ACTOR)
    expect(asAudit?.actorId).toBe(ACTOR)
    expect(JSON.stringify(evAudit?.after)).toContain('CONFIRMED')
  })
})
