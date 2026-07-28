import type { PrismaClient } from '@/generated/prisma/client'
import { auth } from '@/lib/auth'

/**
 * Datos REALES y helpers compartidos entre el seed de dev y el de producción.
 * Acá NO hay datos falsos: solo las categorías reales, los feriados y el alta
 * idempotente del admin. Los 10 empleados/evento de prueba viven SOLO en
 * seed.dev.ts.
 */

/** Día de negocio (@db.Date): fecha pura, sin corrimiento por timezone. */
export function baWorkDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`)
}
function minutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

const LUN = 1
const MAR = 2
const MIE = 3
const JUE = 4
const VIE = 5

export const CATEGORIAS = [
  {
    name: 'Media jornada L-M',
    description: 'Lunes, martes y miércoles de 09:00 a 14:00',
    days: [LUN, MAR, MIE].map((dayOfWeek) => ({ dayOfWeek, startMinute: minutes('09:00'), endMinute: minutes('14:00') })),
  },
  {
    name: 'Jornada completa L-V',
    description: 'Lunes a viernes de 09:00 a 17:00',
    days: [LUN, MAR, MIE, JUE, VIE].map((dayOfWeek) => ({ dayOfWeek, startMinute: minutes('09:00'), endMinute: minutes('17:00') })),
  },
] as const

/**
 * Feriados nacionales. Se cargan por AÑO y hay que ir agregando los que vienen.
 *
 * POR QUÉ IMPORTA: un feriado que NO está acá se comporta como día laborable.
 * El motor de asistencia no encuentra el `Holiday`, cae en la rama del horario
 * habitual, y sin fichada marca ABSENT — o sea, le descuenta el día a cada
 * empleado que tenía turno. Un feriado olvidado es plata mal descontada, no una
 * molestia estética.
 *
 * La fecha que va acá es la EFECTIVA (el día que la gente no trabaja). Para los
 * feriados trasladables eso NO es la fecha original: si el traslado mueve el
 * feriado al lunes, el martes original es día laborable y el lunes no.
 *
 * Cómo agregar un año nuevo: ver README, sección "Feriados".
 */

const FERIADOS_2026 = [
  { date: '2026-01-01', label: 'Año Nuevo' },
  { date: '2026-02-16', label: 'Carnaval' },
  { date: '2026-02-17', label: 'Carnaval' },
  { date: '2026-03-24', label: 'Día Nacional de la Memoria por la Verdad y la Justicia' },
  { date: '2026-04-02', label: 'Día del Veterano y de los Caídos en Malvinas' },
  { date: '2026-04-03', label: 'Viernes Santo' },
  { date: '2026-05-01', label: 'Día del Trabajador' },
  { date: '2026-05-25', label: 'Día de la Revolución de Mayo' },
  { date: '2026-06-17', label: 'Paso a la Inmortalidad del Gral. Güemes' },
  { date: '2026-06-20', label: 'Paso a la Inmortalidad del Gral. Belgrano (Día de la Bandera)' },
  { date: '2026-07-09', label: 'Día de la Independencia' },
  { date: '2026-08-17', label: 'Paso a la Inmortalidad del Gral. San Martín' },
  { date: '2026-10-12', label: 'Día del Respeto a la Diversidad Cultural' },
  { date: '2026-11-20', label: 'Día de la Soberanía Nacional' },
  { date: '2026-12-08', label: 'Inmaculada Concepción de María' },
  { date: '2026-12-25', label: 'Navidad' },
] as const

/**
 * 2027. Pascua cae el domingo 28/03/2027, de ahí salen Carnaval (8 y 9 de
 * febrero) y Viernes Santo (26 de marzo).
 *
 * Los cuatro TRASLADABLES van con la fecha ya corrida, marcados abajo con su
 * fecha original. Ese corrimiento es el único dato de esta lista que no es
 * puramente de calendario: sale de aplicar el régimen de traslado a la fecha
 * original, así que conviene confirmarlo contra el calendario oficial antes de
 * que llegue cada uno. Un traslado mal puesto descuenta un día que no
 * correspondía y no descuenta uno que sí.
 *
 * NO incluye los "días no laborables con fines turísticos" (los puentes): no
 * son feriados de calendario, se fijan por decreto y para 2027 todavía no
 * están publicados. Cuando salgan, se agregan (ver README).
 */
const FERIADOS_2027 = [
  { date: '2027-01-01', label: 'Año Nuevo' },
  { date: '2027-02-08', label: 'Carnaval' },
  { date: '2027-02-09', label: 'Carnaval' },
  { date: '2027-03-24', label: 'Día Nacional de la Memoria por la Verdad y la Justicia' },
  { date: '2027-03-26', label: 'Viernes Santo' },
  { date: '2027-04-02', label: 'Día del Veterano y de los Caídos en Malvinas' },
  { date: '2027-05-01', label: 'Día del Trabajador' },
  { date: '2027-05-25', label: 'Día de la Revolución de Mayo' },
  { date: '2027-06-20', label: 'Paso a la Inmortalidad del Gral. Belgrano (Día de la Bandera)' },
  { date: '2027-06-21', label: 'Paso a la Inmortalidad del Gral. Güemes (trasladado del jueves 17/06)' },
  { date: '2027-07-09', label: 'Día de la Independencia' },
  { date: '2027-08-16', label: 'Paso a la Inmortalidad del Gral. San Martín (trasladado del martes 17/08)' },
  { date: '2027-10-11', label: 'Día del Respeto a la Diversidad Cultural (trasladado del martes 12/10)' },
  { date: '2027-11-20', label: 'Día de la Soberanía Nacional' },
  { date: '2027-12-08', label: 'Inmaculada Concepción de María' },
  { date: '2027-12-25', label: 'Navidad' },
] as const

/** Todos los años cargados. Agregar acá el array del año nuevo. */
export const FERIADOS = [...FERIADOS_2026, ...FERIADOS_2027]

/**
 * GUARDARRAÍL del seed de DEV: falla RUIDOSO si se intenta correr contra
 * producción. Un seed de dev en la base real mete 10 empleados falsos y un
 * admin con password conocida.
 */
export function assertLocalDatabase(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ABORTADO: el seed de DEV no se corre con NODE_ENV=production.')
  }
  const url = process.env.DATABASE_URL ?? ''
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    /* URL inválida → cae en el chequeo de abajo */
  }
  const local = host === 'localhost' || host === '127.0.0.1' || host === '::1'
  if (!local) {
    throw new Error(
      `ABORTADO: el seed de DEV solo corre contra una base LOCAL. Host detectado: "${host || 'desconocido'}". ` +
        'Para poblar producción usá `pnpm db:seed:prod`.',
    )
  }
}

/** Categorías reales + su plantilla. Idempotente. Devuelve name→id. */
export async function seedCategories(prisma: PrismaClient): Promise<Map<string, string>> {
  const byName = new Map<string, string>()
  for (const cat of CATEGORIAS) {
    // findFirst, NO findUnique: `name` es unique PARCIAL.
    let categoria = await prisma.employeeCategory.findFirst({ where: { name: cat.name, deletedAt: null }, select: { id: true } })
    if (!categoria) {
      categoria = await prisma.employeeCategory.create({ data: { name: cat.name, description: cat.description }, select: { id: true } })
    }
    byName.set(cat.name, categoria.id)
    for (const day of cat.days) {
      const existente = await prisma.categoryDay.findFirst({
        where: { categoryId: categoria.id, dayOfWeek: day.dayOfWeek, startMinute: day.startMinute, deletedAt: null },
        select: { id: true },
      })
      if (!existente) await prisma.categoryDay.create({ data: { categoryId: categoria.id, ...day } })
    }
  }
  return byName
}

/**
 * Feriados de todos los años cargados. `Holiday.date` es unique total → upsert
 * por fecha: re-correr el seed después de agregar un año siembra solo lo nuevo
 * y corrige el label de lo que ya estaba, sin duplicar ni pisar nada más.
 */
export async function seedHolidays(prisma: PrismaClient): Promise<void> {
  for (const f of FERIADOS) {
    const date = baWorkDate(f.date)
    await prisma.holiday.upsert({ where: { date }, update: { label: f.label }, create: { date, label: f.label } })
  }
}

/**
 * Admin idempotente. La credencial la hashea Better Auth (nunca a mano). Los
 * datos vienen por parámetro: dev los hardcodea, prod los lee del entorno.
 */
export async function seedAdmin(
  prisma: PrismaClient,
  admin: { email: string; password: string; name: string },
): Promise<void> {
  const conCredencial = await prisma.user.findFirst({
    where: { email: admin.email },
    select: { id: true, accounts: { where: { providerId: 'credential' }, select: { id: true } } },
  })

  if (conCredencial?.accounts.length) {
    await prisma.user.update({ where: { id: conCredencial.id }, data: { role: 'ADMIN', emailVerified: true, name: admin.name } })
    return
  }
  if (conCredencial) {
    throw new Error(
      `El usuario ${admin.email} existe sin cuenta 'credential'. Reseteá esa fila antes de re-seedear.`,
    )
  }
  await auth.api.signUpEmail({ body: { email: admin.email, password: admin.password, name: admin.name } })
  await prisma.user.update({ where: { email: admin.email }, data: { role: 'ADMIN', emailVerified: true } })
}
