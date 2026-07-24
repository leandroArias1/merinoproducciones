# PROFORMA

Sistema de gestión para empresa de eventos.
Stack: Next.js 15 App Router, TS, Tailwind v4, shadcn/ui, Prisma, PostgreSQL, Better Auth.

## Reglas innegociables
- Nunca `prisma migrate` (proyecto Supabase). SQL directo en el dashboard.
- Nada de hard delete: todo soft delete (`deletedAt`).
  - Excepción: `Attendance` NO lleva soft delete. Es un resumen derivado que
    se recalcula y se pisa; su unique `(employeeId, workDate)` es un unique
    normal (no parcial) porque el cron de ausencias hace `upsert` sobre él.
  - Excepción: `AuditLog` tampoco, es inmutable.
  - Excepción: las 4 tablas de Better Auth (`User`, `Session`, `Account`,
    `Verification`) tampoco. Better Auth borra de verdad; sus FK a `User` van
    en CASCADE, NO en la política RESTRICT del proyecto. El schema de esas
    tablas sale de `@better-auth/cli generate` (fuente de verdad), adaptado a
    Timestamptz y con `role` como enum `UserRole`. Requiere `BETTER_AUTH_SECRET`
    en el entorno. La credencial (hash del password) SIEMPRE la crea la API de
    Better Auth, nunca se escribe a mano.
- La app NUNCA borra usuarios (hard delete de la fila `User`): los desactiva.
  Un delete real dispara el `ON DELETE SET NULL` de `audit_log.actorId` y
  perdés el "quién" de cada cambio de sueldo/asistencia que hizo esa persona.
  Baja de alguien = desactivar su `Employee` (`active=false` / `deletedAt`) y
  revocar sus sesiones; la fila `User` se conserva para siempre.
- Todo cambio en sueldos, asistencia o caja escribe en `AuditLog`.
- Montos en enteros (centavos). NUNCA float.
- Fechas en UTC en la DB, se muestran en America/Argentina/Buenos_Aires.
  La conexión de la app fuerza UTC con `options: '-c timezone=UTC'` en la
  PoolConfig de `src/lib/db.ts` (defensa principal, versionada); el
  `ALTER DATABASE` de `sql/02_timezone.sql` es refuerzo. Hay test de regresión
  (`tests/timezone.test.ts`).
- Toda lógica de cálculo (asistencia, ausencias, liquidación) vive en
  `src/lib/domain/` como funciones puras y tiene test con Vitest.
- Ningún cálculo de plata dentro de un componente React.
- NINGUNA Server Action ni Route Handler que mute se escribe sin pasar por el
  wrapper `action(roles, fn)` de `@/lib/auth/action` (default DENEGAR). El
  middleware y los `requireRole` protegen páginas; las actions son endpoints
  HTTP públicos con un ID, invocables con cualquier sesión. El wrapper valida
  sesión + rol antes de ejecutar y expone el `actorId` real para AuditLog.

## Base de datos
- Prisma 7. El client se importa SIEMPRE desde `@/generated/prisma/client`,
  NUNCA desde `@prisma/client`. Se genera en `src/generated/` (gitignoreado)
  vía `postinstall`. Las URLs de conexión no van en `schema.prisma`: las de
  CLI viven en `prisma.config.ts` y la de runtime se pasa por adapter al
  constructor de `PrismaClient`.
- `prisma migrate diff` está PERMITIDO: es offline y no aplica nada.
  Usarlo siempre con `--from-empty` / `--to-schema` (en Prisma 7 el flag
  `--to-schema-datamodel` se llama `--to-schema`, y `--from-schema-datasource`
  pasó a ser `--from-config-datasource`).
  PROHIBIDOS: `migrate dev`, `migrate deploy`, `db push`.
- `pnpm db:drift` compara la DB real contra el schema (solo lectura, no
  aplica nada). Correrlo ante cualquier duda de desincronización.
  Su salida NUNCA es vacía y NO se aplica nunca: el chequeo es compararla
  contra `sql/EXPECTED_DRIFT.md`, que congela el ruido esperado y explica
  cada ítem. Drift real = cualquier cosa FUERA de ese archivo.
- Historial de cambios de schema: archivos numerados en `sql/` (`00_`, `01_`,
  `02_`…). Los archivos viejos NUNCA se editan: cada cambio nuevo es un
  archivo nuevo. Todos empiezan con `BEGIN;` y terminan con `COMMIT;`.
- La base TIENE que estar en UTC (`sql/02_timezone.sql`). El driver adapter de
  Prisma manda los timestamps sin marca de zona: si la zona de sesión no es
  UTC, Postgres guarda un instante corrido Y Prisma lo relee bien, así que el
  error queda TAPADO y solo se ve desde SQL crudo o un cron. Ante cualquier
  duda: `SHOW timezone;` debe decir `UTC`.
- Los uniques de negocio viven como índices PARCIALES en SQL
  (`WHERE "deletedAt" IS NULL`), no como `@unique` de Prisma.
  **NUNCA usar `findUnique` sobre esos campos** (`documentId`, `userId`,
  `EmployeeCategory.name`, etc.). Siempre:
  `findFirst({ where: { <campo>, deletedAt: null } })`.
  Motivo: Prisma cree que son únicos, pero la DB solo lo garantiza para las
  filas ACTIVAS. Un `findUnique` puede devolver una fila soft-deleteada.
  Caso real: empleado dado de baja y re-contratado con la misma cuenta → el
  loader de sesión carga el legajo viejo.
  Lo mismo aplica a `upsert`, que resuelve por clave única.
  Únicos con `findUnique` real (unique TOTAL en la DB): `User.email` y
  `Attendance(employeeId, workDate)`.
- `BigInt` no serializa a JSON: `JSON.stringify(1n)` tira excepción, y pasar
  un `BigInt` de Server a Client Component también rompe. Convertir a string
  en el borde (Server Action / route handler) o usar `superjson`.

## Reglas de negocio
- Si un empleado tiene una asignación a evento ese día, se ignora su horario
  habitual y NO se genera ausencia.
- Turnos que cruzan medianoche (desarmado 00:00-05:00) pertenecen al día
  de inicio de la asignación.
- Un empleado puede tener varias asignaciones el mismo día.
- El motor de asistencia (`src/lib/domain/attendance.ts`) es una función pura:
  recibe datos planos (instantes ya resueltos, turnos ya bucketeados por
  workDate) y devuelve status + minutos + warnings. Sin Prisma, sin I/O.
- Una asignación sin fichada NO es presencia: solo cuenta como trabajada si el
  supervisor la marca `COMPLETED`. Sin fichada y sin `COMPLETED` → status
  `UNVERIFIED`.
- PAYROLL NO PUEDE CERRAR UN PERÍODO CON DÍAS EN `UNVERIFIED`: son días sin
  evidencia (asignación sin fichada ni confirmación) que un humano tiene que
  resolver antes de liquidar. Es un bloqueo duro, no un warning ignorable.
- Las asignaciones `CANCELLED` no generan expectativa (el motor las descarta).
- TODA mutación que toque un `TimeEntry` o el `status` de un `EventAssignment`
  DEBE llamar a `recalculate(employeeId, workDate)` (de `@/lib/attendance`).
  El cron nocturno es la red, no el único mecanismo: sin este llamado, un día
  queda con un status viejo (p.ej. `UNVERIFIED`) hasta la próxima corrida y
  traba la liquidación. Vale para crear/editar/borrar fichadas y para pasar una
  asignación a `COMPLETED`/`CANCELLED`.
- `WorkSchedule` con más de un tramo el mismo día (turno partido) NO está
  soportado por el motor: el caller (`buildInput`) tira error a propósito, para
  no liquidar con un `expectedMinutes` corto en silencio.
- La tolerancia de tardanza vive en un solo lugar
  (`src/lib/domain/attendance-config.ts`) y se pasa al motor por parámetro,
  para hacerla configurable por el admin sin tocar la lógica.

## Testing
Antes de dar por terminada una tarea: `pnpm test` y `pnpm build` en verde.