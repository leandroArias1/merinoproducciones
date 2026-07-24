import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { prisma } from '@/lib/db'

/**
 * TEST DE REGRESIÓN de zona horaria.
 *
 * Guarda la invariante "la DB guarda instantes en UTC" contra el bug real que
 * encontramos: el driver adapter de Prisma manda los timestamps sin marca de
 * zona; si la sesión no es UTC, Postgres guarda un instante corrido y Prisma
 * lo relee bien, TAPANDO el error. Solo se ve casteando a texto en UTC.
 *
 * La defensa es `options: '-c timezone=UTC'` en la PoolConfig de src/lib/db.ts.
 * Para que este test FALLE si alguien la borra, el `beforeAll` ensucia la
 * default de la base a una zona NO-UTC: sin el fix, la conexión de la app
 * heredaría esa zona y el instante se guardaría corrido.
 *
 * Necesita un Postgres real en DATABASE_URL (test de integración).
 */

const DB_URL = process.env.DATABASE_URL
const ZONA_HOSTIL = 'America/Argentina/Mendoza' // UTC-3, corrimiento visible de 3h

// Instante conocido: 08:00 hora Buenos Aires = 11:00 UTC.
const INSTANTE = new Date('2026-08-14T11:00:00.000Z')
const ESPERADO_UTC = '2026-08-14T11:00:00Z'
const EVENTO_NOMBRE = '__tz_regression__'

function dbName(url: string): string {
  return new URL(url).pathname.replace(/^\//, '')
}

async function setDefaultTimezone(zona: string): Promise<void> {
  const admin = new pg.Client({ connectionString: DB_URL })
  await admin.connect()
  // ALTER DATABASE ... SET solo afecta sesiones NUEVAS; la conexión de la app
  // se abre después (lazy), así que la hereda.
  await admin.query(`ALTER DATABASE "${dbName(DB_URL!)}" SET timezone TO '${zona}'`)
  await admin.end()
}

describe('zona horaria: la app guarda instantes en UTC', () => {
  beforeAll(async () => {
    if (!DB_URL) throw new Error('DATABASE_URL requerida para el test de zona')
    await setDefaultTimezone(ZONA_HOSTIL) // condición hostil, ANTES de tocar prisma
  })

  afterAll(async () => {
    if (DB_URL) {
      await prisma.event.deleteMany({ where: { name: EVENTO_NOMBRE } })
      await setDefaultTimezone('UTC') // dejar la base como estaba
    }
    await prisma.$disconnect()
  })

  it('fuerza UTC en la conexión pese a una default de base hostil', async () => {
    // Si se borra `options: '-c timezone=UTC'` de db.ts, esto devuelve
    // "America/Argentina/Mendoza" y el test falla.
    const [{ tz }] = await prisma.$queryRaw<{ tz: string }[]>`
      SELECT current_setting('timezone') AS tz`
    expect(tz).toBe('UTC')
  })

  it('un instante conocido round-trips en UTC sin corrimiento', async () => {
    await prisma.event.deleteMany({ where: { name: EVENTO_NOMBRE } })

    const creado = await prisma.event.create({
      data: {
        name: EVENTO_NOMBRE,
        startAt: INSTANTE,
        endAt: new Date(INSTANTE.getTime() + 3_600_000),
      },
      select: { id: true },
    })

    // Lectura CRUDA casteando a texto en UTC: revela el instante REAL guardado,
    // no el que Prisma "corrige" al releer.
    const [{ iso }] = await prisma.$queryRaw<{ iso: string }[]>`
      SELECT to_char("startAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS iso
      FROM event WHERE id = ${creado.id}`

    expect(iso).toBe(ESPERADO_UTC)

    // Y el round-trip por Prisma también tiene que dar el mismo instante.
    const releido = await prisma.event.findUniqueOrThrow({
      where: { id: creado.id },
      select: { startAt: true },
    })
    expect(releido.startAt.toISOString()).toBe(INSTANTE.toISOString())
  })
})
