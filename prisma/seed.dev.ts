import { prisma } from '@/lib/db'
import { assertLocalDatabase, seedCategories, seedHolidays, seedAdmin, baWorkDate } from './seed-shared'

/**
 * Seed de DESARROLLO. Datos reales (categorías, feriados, admin) MÁS datos
 * FALSOS de prueba: 10 empleados, un evento y sus asignaciones.
 *
 * NUNCA debe correr contra producción — `assertLocalDatabase()` aborta si no es
 * una base local. Idempotente.
 */

const BA_OFFSET = '-03:00'
function baInstant(day: string, time: string): Date {
  return new Date(`${day}T${time}:00${BA_OFFSET}`)
}
const VIGENCIA_DESDE = baWorkDate('2026-01-01')

const ADMIN_DEV = {
  email: 'admin@merinoproducciones.com',
  name: 'Admin Merino',
  // Password de PRUEBA, solo válida en local (el guardarraíl impide prod).
  password: 'Proforma.Admin.2026',
}

const EMPLEADOS = [
  { documentId: '30111222', firstName: 'Rocío',     lastName: 'Alvarez',  position: 'Sonido',      categoria: 'Jornada completa L-V', employmentType: 'MONTHLY' },
  { documentId: '30222333', firstName: 'Nahuel',    lastName: 'Benítez',  position: 'Iluminación', categoria: 'Jornada completa L-V', employmentType: 'MONTHLY' },
  { documentId: '30333444', firstName: 'Camila',    lastName: 'Cardozo',  position: 'Montaje',     categoria: 'Jornada completa L-V', employmentType: 'MONTHLY' },
  { documentId: '30444555', firstName: 'Ignacio',   lastName: 'Duarte',   position: 'Montaje',     categoria: 'Jornada completa L-V', employmentType: 'DAILY' },
  { documentId: '30555666', firstName: 'Sofía',     lastName: 'Escobar',  position: 'Producción',  categoria: 'Jornada completa L-V', employmentType: 'MONTHLY' },
  { documentId: '30666777', firstName: 'Tomás',     lastName: 'Ferreyra', position: 'Logística',   categoria: 'Jornada completa L-V', employmentType: 'DAILY' },
  { documentId: '30777888', firstName: 'Julieta',   lastName: 'Gómez',    position: 'Vestuario',   categoria: 'Media jornada L-M',    employmentType: 'HOURLY' },
  { documentId: '30888999', firstName: 'Martín',    lastName: 'Herrera',  position: 'Backline',    categoria: 'Media jornada L-M',    employmentType: 'HOURLY' },
  { documentId: '30999111', firstName: 'Valentina', lastName: 'Ibáñez',   position: 'Catering',    categoria: 'Media jornada L-M',    employmentType: 'PER_EVENT' },
  { documentId: '31111222', firstName: 'Federico',  lastName: 'Juárez',   position: 'Seguridad',   categoria: 'Media jornada L-M',    employmentType: 'PER_EVENT' },
] as const

const DIA_EVENTO = '2026-08-14'
const DIA_SIGUIENTE = '2026-08-15'
const EVENTO = {
  name: 'Festival Costanera 2026',
  client: 'Municipalidad de Rosario',
  venue: 'Anfiteatro Municipal',
  startAt: baInstant(DIA_EVENTO, '08:00'),
  endAt: baInstant(DIA_SIGUIENTE, '05:00'),
}
const ASIGNACIONES = [
  { documentId: '30333444', role: 'Armado de escenario', isSupervisor: true,  workDate: baWorkDate(DIA_EVENTO),    startAt: baInstant(DIA_EVENTO, '08:00'),    endAt: baInstant(DIA_EVENTO, '18:00') },
  { documentId: '30333444', role: 'Operación en show',   isSupervisor: false, workDate: baWorkDate(DIA_EVENTO),    startAt: baInstant(DIA_EVENTO, '20:00'),    endAt: baInstant(DIA_SIGUIENTE, '00:00') },
  { documentId: '30444555', role: 'Desarmado',           isSupervisor: true,  workDate: baWorkDate(DIA_SIGUIENTE), startAt: baInstant(DIA_SIGUIENTE, '00:00'), endAt: baInstant(DIA_SIGUIENTE, '05:00') },
] as const

async function main() {
  assertLocalDatabase() // ← falla ruidoso si no es local

  const categoriaPorNombre = await seedCategories(prisma)
  const empleadoPorDni = new Map<string, string>()

  for (const emp of EMPLEADOS) {
    const categoryId = categoriaPorNombre.get(emp.categoria)!
    let empleado = await prisma.employee.findFirst({ where: { documentId: emp.documentId, deletedAt: null }, select: { id: true } })
    if (!empleado) {
      empleado = await prisma.employee.create({
        data: {
          documentId: emp.documentId,
          firstName: emp.firstName,
          lastName: emp.lastName,
          position: emp.position,
          employmentType: emp.employmentType,
          categoryId,
          hireDate: VIGENCIA_DESDE,
        },
        select: { id: true },
      })
    }
    empleadoPorDni.set(emp.documentId, empleado.id)

    const plantilla = await prisma.categoryDay.findMany({ where: { categoryId, deletedAt: null }, select: { dayOfWeek: true, startMinute: true, endMinute: true } })
    for (const day of plantilla) {
      const existente = await prisma.workSchedule.findFirst({
        where: { employeeId: empleado.id, dayOfWeek: day.dayOfWeek, effectiveFrom: VIGENCIA_DESDE, startMinute: day.startMinute, deletedAt: null },
        select: { id: true },
      })
      if (!existente) {
        await prisma.workSchedule.create({
          data: { employeeId: empleado.id, dayOfWeek: day.dayOfWeek, startMinute: day.startMinute, endMinute: day.endMinute, isException: false, effectiveFrom: VIGENCIA_DESDE, effectiveTo: null },
        })
      }
    }
  }

  await seedAdmin(prisma, ADMIN_DEV)

  let evento = await prisma.event.findFirst({ where: { name: EVENTO.name, startAt: EVENTO.startAt, deletedAt: null }, select: { id: true } })
  if (!evento) {
    evento = await prisma.event.create({ data: { ...EVENTO, status: 'CONFIRMED' }, select: { id: true } })
  }
  for (const asig of ASIGNACIONES) {
    const employeeId = empleadoPorDni.get(asig.documentId)!
    const existente = await prisma.eventAssignment.findFirst({ where: { eventId: evento.id, employeeId, startAt: asig.startAt, deletedAt: null }, select: { id: true } })
    if (!existente) {
      await prisma.eventAssignment.create({
        data: { eventId: evento.id, employeeId, role: asig.role, isSupervisor: asig.isSupervisor, workDate: asig.workDate, startAt: asig.startAt, endAt: asig.endAt, status: 'CONFIRMED' },
      })
    }
  }

  await seedHolidays(prisma)
  console.log('Seed de DEV OK (categorías, empleados de prueba, evento, feriados, admin).')
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
