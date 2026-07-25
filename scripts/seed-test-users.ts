/**
 * Seed de UN SOLO USO para desbloquear el QA de los flujos de EMPLOYEE y
 * SUPERVISOR (bloques E y F). NO es el arreglo del hueco de gestión de usuarios
 * (bug #3): eso es UI y va en la sesión de arreglos. Esto solo deja dos logins
 * vinculados a un legajo para poder testear a mano.
 *
 * Crea (idempotente):
 *   1. Categoría "Jornada completa L-V" y "Media jornada L-M" si faltan.
 *   2. Dos empleados con su WorkSchedule:
 *        - Supervisor QA (DNI 90000001)  → user SUPERVISOR, employee.userId link
 *        - Empleado QA   (DNI 90000002)  → user EMPLOYEE,   employee.userId link
 *   3. Un evento "QA E2E - Fichaje" HOY con dos asignaciones en el MISMO evento:
 *        - Supervisor QA: isSupervisor = true  (así ve/ficha al grupo)
 *        - Empleado QA:   isSupervisor = false
 *      (El supervisor NO es supervisor de "QA Evento Julio" → sirve para probar
 *       "no accede a evento ajeno".)
 *
 * La credencial (hash del password) la crea SIEMPRE Better Auth
 * (`auth.api.signUpEmail`), nunca se escribe a mano — igual que `seedAdmin`.
 *
 * ── Cómo correrlo (contra la base de PRUEBA del deploy) ──
 *   DATABASE_URL="<pooler :6543 ?pgbouncer=true&connection_limit=1>" \
 *   BETTER_AUTH_SECRET="<el del deploy>" \
 *   SEED_TEST_USERS_CONFIRM=1 \
 *   pnpm tsx scripts/seed-test-users.ts
 *
 * Requiere el flag SEED_TEST_USERS_CONFIRM=1 como confirmación explícita
 * (a diferencia del seed de dev, este SÍ apunta a una base remota a propósito).
 */

import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { seedCategories, baWorkDate } from '../prisma/seed-shared'

const BA_OFFSET = '-03:00'
function baInstant(day: string, time: string): Date {
  return new Date(`${day}T${time}:00${BA_OFFSET}`)
}

// HOY en calendario BA. Se pasa por env para no depender del reloj del runner
// (y para poder re-apuntar el evento a otro día si hiciera falta).
const DIA = process.env.SEED_TEST_DAY ?? '2026-07-24'
const VIGENCIA_DESDE = baWorkDate('2026-01-01')

const CATEGORIA = 'Jornada completa L-V'

const PERSONAS = [
  {
    documentId: '90000001',
    firstName: 'Supervisor',
    lastName: 'QA',
    position: 'Supervisión',
    email: 'supervisor.qa@merinoproducciones.com',
    password: 'Supervisor.QA.2026',
    role: 'SUPERVISOR' as const,
    isSupervisor: true,
    assignmentRole: 'Supervisión',
  },
  {
    documentId: '90000002',
    firstName: 'Empleado',
    lastName: 'QA',
    position: 'Operación',
    email: 'empleado.qa@merinoproducciones.com',
    password: 'Empleado.QA.2026',
    role: 'EMPLOYEE' as const,
    isSupervisor: false,
    assignmentRole: 'Operación',
  },
]

function assertConfirmed(): void {
  if (process.env.SEED_TEST_USERS_CONFIRM !== '1') {
    throw new Error(
      'ABORTADO: falta SEED_TEST_USERS_CONFIRM=1. Este seed apunta a una base ' +
        'REMOTA a propósito (la de prueba del deploy). Confirmá con el flag.',
    )
  }
  let host = 'desconocido'
  try {
    host = new URL(process.env.DATABASE_URL ?? '').hostname
  } catch {
    /* url inválida → getClient fallará con mensaje claro */
  }
  console.log(`▶ Seed de usuarios de prueba contra host: ${host}`)
}

/**
 * Alta idempotente de un login. La credencial la hashea Better Auth. Devuelve
 * el userId. Mismo patrón que `seedAdmin` de prisma/seed-shared.ts.
 */
async function ensureUser(p: (typeof PERSONAS)[number]): Promise<string> {
  const existing = await prisma.user.findFirst({
    where: { email: p.email },
    select: { id: true, accounts: { where: { providerId: 'credential' }, select: { id: true } } },
  })

  if (existing?.accounts.length) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: p.role, emailVerified: true, name: `${p.firstName} ${p.lastName}` },
    })
    console.log(`  · user ${p.email} ya existía → rol ${p.role} asegurado`)
    return existing.id
  }
  if (existing) {
    throw new Error(`El usuario ${p.email} existe SIN cuenta 'credential'. Reseteá esa fila antes de re-seedear.`)
  }

  await auth.api.signUpEmail({ body: { email: p.email, password: p.password, name: `${p.firstName} ${p.lastName}` } })
  const created = await prisma.user.update({
    where: { email: p.email },
    data: { role: p.role, emailVerified: true },
    select: { id: true },
  })
  console.log(`  · user ${p.email} creado (rol ${p.role})`)
  return created.id
}

/** Alta idempotente del legajo + su horario, vinculado al user. Devuelve employeeId. */
async function ensureEmployee(p: (typeof PERSONAS)[number], userId: string, categoryId: string): Promise<string> {
  let emp = await prisma.employee.findFirst({
    where: { documentId: p.documentId, deletedAt: null },
    select: { id: true, userId: true },
  })
  if (!emp) {
    emp = await prisma.employee.create({
      data: {
        documentId: p.documentId,
        firstName: p.firstName,
        lastName: p.lastName,
        position: p.position,
        employmentType: 'MONTHLY',
        categoryId,
        hireDate: VIGENCIA_DESDE,
        userId,
      },
      select: { id: true, userId: true },
    })
    console.log(`  · empleado ${p.lastName}, ${p.firstName} (DNI ${p.documentId}) creado y vinculado`)
  } else if (emp.userId !== userId) {
    await prisma.employee.update({ where: { id: emp.id }, data: { userId, categoryId } })
    console.log(`  · empleado ${p.documentId} vinculado al user`)
  }

  // WorkSchedule desde la plantilla de la categoría (idempotente).
  const plantilla = await prisma.categoryDay.findMany({
    where: { categoryId, deletedAt: null },
    select: { dayOfWeek: true, startMinute: true, endMinute: true },
  })
  for (const day of plantilla) {
    const yaEsta = await prisma.workSchedule.findFirst({
      where: { employeeId: emp.id, dayOfWeek: day.dayOfWeek, effectiveFrom: VIGENCIA_DESDE, startMinute: day.startMinute, deletedAt: null },
      select: { id: true },
    })
    if (!yaEsta) {
      await prisma.workSchedule.create({
        data: { employeeId: emp.id, dayOfWeek: day.dayOfWeek, startMinute: day.startMinute, endMinute: day.endMinute, isException: false, effectiveFrom: VIGENCIA_DESDE, effectiveTo: null },
      })
    }
  }
  return emp.id
}

async function main() {
  assertConfirmed()

  const categoriaPorNombre = await seedCategories(prisma)
  const categoryId = categoriaPorNombre.get(CATEGORIA)
  if (!categoryId) throw new Error(`No se encontró la categoría "${CATEGORIA}" tras seedCategories.`)

  const empIdByDni = new Map<string, string>()
  for (const p of PERSONAS) {
    const userId = await ensureUser(p)
    const empId = await ensureEmployee(p, userId, categoryId)
    empIdByDni.set(p.documentId, empId)
  }

  // Evento HOY con las dos asignaciones en el MISMO evento.
  const startAt = baInstant(DIA, '09:00')
  const endAt = baInstant(DIA, '17:00')
  const workDate = baWorkDate(DIA)

  let evento = await prisma.event.findFirst({
    where: { name: 'QA E2E - Fichaje', startAt, deletedAt: null },
    select: { id: true },
  })
  if (!evento) {
    evento = await prisma.event.create({
      data: { name: 'QA E2E - Fichaje', client: 'QA', venue: 'QA', status: 'CONFIRMED', startAt, endAt },
      select: { id: true },
    })
    console.log('  · evento "QA E2E - Fichaje" creado')
  }

  for (const p of PERSONAS) {
    const employeeId = empIdByDni.get(p.documentId)!
    const yaEsta = await prisma.eventAssignment.findFirst({
      where: { eventId: evento.id, employeeId, startAt, deletedAt: null },
      select: { id: true },
    })
    if (!yaEsta) {
      await prisma.eventAssignment.create({
        data: {
          eventId: evento.id,
          employeeId,
          role: p.assignmentRole,
          isSupervisor: p.isSupervisor,
          workDate,
          startAt,
          endAt,
          status: 'CONFIRMED',
        },
      })
      console.log(`  · asignación de ${p.lastName} (isSupervisor=${p.isSupervisor}) creada`)
    }
  }

  console.log('\n✔ Seed OK. Logins de prueba:')
  console.log('   SUPERVISOR  supervisor.qa@merinoproducciones.com  /  Supervisor.QA.2026')
  console.log('   EMPLOYEE    empleado.qa@merinoproducciones.com    /  Empleado.QA.2026')
  console.log(`   Evento con turno hoy (${DIA} 09:00–17:00): "QA E2E - Fichaje"`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('\nSeed FALLO:', e)
    await prisma.$disconnect()
    process.exit(1)
  })
