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

export const FERIADOS_2026 = [
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

/** Feriados 2026. `Holiday.date` es unique total → upsert por fecha. */
export async function seedHolidays(prisma: PrismaClient): Promise<void> {
  for (const f of FERIADOS_2026) {
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
