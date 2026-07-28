import { prisma } from '@/lib/db'
import { seedCategories, seedHolidays, seedAdmin, FERIADOS } from './seed-shared'

/**
 * Seed de PRODUCCIÓN. SOLO datos reales, idempotente:
 *   · las 2 EmployeeCategory con sus plantillas
 *   · los feriados nacionales cargados (2026 y 2027)
 *   · UN usuario ADMIN, con credenciales leídas de ADMIN_EMAIL / ADMIN_PASSWORD.
 *
 * SIN datos falsos, SIN credenciales hardcodeadas. Si faltan las variables de
 * entorno, aborta con un error claro.
 */
async function main() {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  if (!email || !password) {
    throw new Error(
      'ABORTADO: faltan ADMIN_EMAIL y/o ADMIN_PASSWORD. El seed de producción NO ' +
        'usa credenciales hardcodeadas: seteá esas variables antes de correrlo.',
    )
  }
  if (password.length < 8) {
    throw new Error('ABORTADO: ADMIN_PASSWORD debe tener al menos 8 caracteres.')
  }

  await seedCategories(prisma)
  await seedHolidays(prisma)
  await seedAdmin(prisma, { email, password, name: process.env.ADMIN_NAME || 'Administrador' })

  console.log(`Seed de PRODUCCIÓN OK: 2 categorías, ${FERIADOS.length} feriados, admin ${email}.`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
