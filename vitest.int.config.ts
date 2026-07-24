import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * Config INTEGRACIÓN (`pnpm test:int`): tests que necesitan un Postgres real
 * en DATABASE_URL (p.ej. el de regresión de zona horaria). NO corren en la
 * corrida rápida de cada commit.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    env: {
      // Los tests de integración apuntan a un Postgres local, no al pooler.
      PRISMA_SKIP_POOLER_CHECK: '1',
      // Better Auth necesita un secret para firmar sesiones.
      BETTER_AUTH_SECRET: 'test-secret-0123456789abcdef0123456789',
    },
    // Los tests de integración tocan la misma base: sin paralelismo entre
    // archivos para evitar pisarse.
    fileParallelism: false,
  },
})
