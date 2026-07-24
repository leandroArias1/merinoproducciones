import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'

/**
 * Singleton de PrismaClient (Prisma 7 con driver adapter @prisma/adapter-pg).
 *
 * Inicialización PEREZOSA: el cliente se crea (y se valida DATABASE_URL) recién
 * en el primer uso, no al importar el módulo. Así `next build` puede importar
 * módulos que dependen de `prisma` sin necesitar la conexión ni la variable de
 * entorno (el build no ejecuta queries). En runtime, la primera query dispara
 * la creación y la validación.
 */

function assertPoolerParams(url: string): void {
  // En transaction mode del pooler de Supabase estos parámetros son la
  // convención; además cazan el caso de pegar la URL directa (:5432) por error.
  const { searchParams, port } = new URL(url)
  const faltan: string[] = []
  if (searchParams.get('pgbouncer') !== 'true') faltan.push('pgbouncer=true')
  if (searchParams.get('connection_limit') !== '1') faltan.push('connection_limit=1')
  if (faltan.length > 0) {
    throw new Error(
      `DATABASE_URL (puerto ${port || 'sin especificar'}) no declara: ` +
        `${faltan.join(', ')}. Tiene que ser el pooler de Supabase (:6543) ` +
        'en transaction mode. La conexión directa (:5432) va en DIRECT_URL.',
    )
  }
}

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error(
      'Falta DATABASE_URL. Debe apuntar al pooler de Supabase (:6543) ' +
        'con ?pgbouncer=true&connection_limit=1',
    )
  }
  // En test/seed contra un Postgres local no hay pooler: se saltea con
  // PRISMA_SKIP_POOLER_CHECK=1.
  if (process.env.PRISMA_SKIP_POOLER_CHECK !== '1') {
    assertPoolerParams(connectionString)
  }

  const adapter = new PrismaPg({
    connectionString,
    // Límite real de conexiones con driver adapter (el connection_limit de la
    // URL no lo aplica nadie con adapter). 1 por instancia: en serverless cada
    // lambda abre su propio pool.
    max: 1,
    // Defensa principal de zona horaria: fuerza UTC en cada conexión. Ver
    // tests/timezone.test.ts. sql/02_timezone.sql es sólo refuerzo.
    options: '-c timezone=UTC',
  })

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}

/**
 * Cache global para el hot reload de Next (que re-evalúa módulos en cada
 * recarga). Sin esto, cada guardado dejaría un pool colgado.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient()
  }
  return globalForPrisma.prisma
}

/**
 * Proxy que difiere la creación al primer acceso. `prisma.employee.findMany(...)`
 * dispara `getClient()` recién en tiempo de ejecución.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getClient()
    const value = Reflect.get(client, prop, receiver)
    return typeof value === 'function' ? value.bind(client) : value
  },
}) as PrismaClient
