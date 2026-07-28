import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * Config UNIT (default de `pnpm test`): SOLO tests puros, rápidos, SIN DB.
 * Es la corrida que se hace en cada commit. El motor de dominio (asistencia,
 * ausencias, liquidación) son funciones puras y sus tests viven en
 * `src/lib/domain/*.test.ts`.
 *
 * Los tests de integración (que necesitan Postgres) están en `tests/` y se
 * corren con `pnpm test:int` (ver vitest.int.config.ts). Se separan a
 * propósito: si el motor de dominio compartiera corrida con tests que piden
 * base, en dos semanas nadie los corre.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'prisma/**/*.test.ts'],
  },
})
