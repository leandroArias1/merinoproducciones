import { defineConfig } from 'prisma/config'

// Prisma 7 ya no carga `.env` automáticamente ni acepta `url`/`directUrl`
// dentro de schema.prisma. Este archivo es el único lugar donde la CLI lee
// la conexión.
try {
  process.loadEnvFile(new URL('.env', import.meta.url).pathname)
} catch {
  // Sin .env local (CI / Vercel): las variables ya vienen del entorno.
}

// Conexión DIRECTA (:5432), NO el pooler. La usan solo los comandos de CLI
// que hablan con el schema engine (`db:drift` → migrate diff
// --from-schema-datasource, `db pull`); pgbouncer no los soporta.
//
// Se arma condicional a propósito: `prisma generate` no necesita conexión, y
// en el build de Vercel corre por `postinstall` posiblemente sin DIRECT_URL.
// Si faltara y se hiciera obligatorio, el build moriría en `pnpm install`
// con un error opaco. Los comandos que sí necesitan la URL fallan solos y
// con mensaje claro.
const directUrl = process.env.DIRECT_URL

export default defineConfig({
  schema: 'prisma/schema.prisma',
  ...(directUrl ? { datasource: { url: directUrl } } : {}),
})
