# DEPLOY — Runbook de producción (PROFORMA)

Guía para desplegar y operar. Si estás leyendo esto dentro de seis meses: seguí
los pasos en orden, no te saltees el chequeo de drift.

Stack: Next.js 15 (Vercel) + Supabase (PostgreSQL) + Better Auth.

---

## 1. Variables de entorno

Configurar en Vercel (Project → Settings → Environment Variables). Todas en
**Production** (y las que apliquen en Preview).

| Variable | Qué es | Ejemplo / cómo obtenerla |
|---|---|---|
| `DATABASE_URL` | Conexión **de runtime** de la app. Es el **pooler** de Supabase (puerto **6543**, transaction mode). DEBE llevar `?pgbouncer=true&connection_limit=1`. | `postgresql://postgres.xxxx:PASS@aws-0-...pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | Conexión **directa** (puerto **5432**). La usa SOLO la CLI de Prisma (`pnpm db:drift`), nunca la app. | `postgresql://postgres:PASS@db.xxxx.supabase.co:5432/postgres` |
| `BETTER_AUTH_SECRET` | Firma las sesiones. **Mínimo 32 caracteres.** | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | URL pública de la app (para callbacks/redirects). | `https://proforma.tudominio.com` |
| `CRON_SECRET` | Protege el endpoint del cron. Vercel lo manda como `Authorization: Bearer <CRON_SECRET>`. | `openssl rand -base64 32` |
| `ADMIN_EMAIL` | Email del admin inicial. **Solo para el seed de prod** (una vez). Email ASCII estándar. | `leandro@merinoproducciones.com` |
| `ADMIN_PASSWORD` | Password del admin inicial. **Solo para el seed de prod.** Mín. 8 caracteres. | (secreta) |
| `ADMIN_NAME` | (Opcional) Nombre del admin. | `Leandro` |

> `NODE_ENV=production` lo setea Vercel solo. No hace falta declararlo.
> `ADMIN_EMAIL` / `ADMIN_PASSWORD` se usan una única vez; se pueden borrar de
> Vercel después de correr el seed de producción.

---

## 2. Esquema de base de datos (SQL, en orden)

No usamos `prisma migrate`. El esquema se aplica con SQL en el **SQL Editor de
Supabase**, en este orden EXACTO:

```
sql/00_tables.sql          # enums, tablas, índices no-parciales, FKs
sql/01_indexes.sql         # índices únicos PARCIALES + CHECK constraints
sql/02_timezone.sql        # ALTER DATABASE ... SET timezone = 'UTC'
sql/03_better_auth.sql     # session, account, verification + user.image
sql/04_attendance.sql      # enum INCOMPLETE/UNVERIFIED + attendance.warnings
sql/05_holidays.sql        # tabla holiday
sql/06_timeentry_location.sql  # columnas de ubicación en time_entry
sql/07_payroll.sql         # LIQUIDACIONES: salary_history, payroll_config/period/item/line
sql/08_search_unaccent.sql # extensión unaccent + pg_trgm + índices del buscador
```

Cada archivo va entre `BEGIN;` / `COMMIT;`.

> **`sql/07_payroll.sql` (Fase 2):** crea las 5 tablas de liquidaciones + sus
> índices únicos PARCIALES (un sueldo/config vigente, un item por empleado-mes) +
> CHECKs. Los `ON DELETE` salen correctos del propio `migrate diff` (RESTRICT en
> las FK de negocio, SET NULL en los punteros a `user`): **no agrega drift**.
>
> **`sql/08_search_unaccent.sql`:** agrega las extensiones `unaccent` y `pg_trgm`,
> la función `f_unaccent()` y dos índices GIN trigram sobre `employee`. Habilita
> el buscador de empleados acento-insensible. **La app lo usa en `listEmployees`:
> si el `08` no está aplicado, la búsqueda de empleados tira error.** Supabase trae
> las dos extensiones; se crean con `CREATE EXTENSION IF NOT EXISTS`.

> ⚠️ **ORDEN CON EL DEPLOY (Fase 2):** aplicá `07` y `08` en Supabase **ANTES** de
> deployar el código de payroll. Si el deploy llega primero, `/admin/liquidaciones`
> y el buscador de `/admin/empleados` tiran error (tablas/función faltantes). El
> resto de la app sigue andando.

> ⚠️ **Después de `02_timezone.sql`: RECONECTAR.** El `ALTER DATABASE SET
> timezone` solo aplica a **sesiones nuevas**. La sesión del SQL Editor que ya
> tenías abierta sigue en la zona vieja. Cerrá y reabrí el editor (o corré los
> archivos 03–06 en una sesión nueva) para que todo hable UTC. Verificá con
> `SHOW timezone;` → debe decir `UTC`.
>
> La defensa principal de zona horaria igual está en el código
> (`options: '-c timezone=UTC'` en `src/lib/db.ts`), así que la app fuerza UTC
> por conexión aunque la default de la base fallara. El `02` es refuerzo.

### Verificar que el esquema quedó bien

```bash
pnpm db:drift
```

Su salida NO es vacía nunca. Comparala contra `sql/EXPECTED_DRIFT.md`: si
aparece algo FUERA de ese archivo, hay drift real. Si coincide, está OK.

---

## 3. Seed de producción (una vez)

SOLO datos reales: 2 categorías, 16 feriados 2026 y **un admin** (credenciales
por variable de entorno, nunca hardcodeadas). Idempotente.

```bash
# con DATABASE_URL (pooler), BETTER_AUTH_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD seteadas
pnpm db:seed:prod
```

- Aborta si faltan `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
- El hash del password lo crea Better Auth (nunca se escribe a mano).
- Loguearse una vez y **cambiar el password** desde la cuenta.
- El seed de DEV (`pnpm db:seed:dev`, 10 empleados falsos) **no puede** correr
  contra producción: aborta si `NODE_ENV=production` o si la URL no es local.

---

## 4. Deploy de la app

1. Conectar el repo a Vercel. Framework: Next.js (autodetectado).
2. Setear las variables de la sección 1.
3. Deploy. `postinstall` corre `prisma generate` (el client se genera en build;
   `src/generated/` está gitignoreado).
4. Smoke test: entrar a `/login`, loguear el admin, ver el dashboard.

### Cron de asistencia

- `vercel.json` ya declara el cron: `/api/cron/attendance` a las `0 3 * * *`
  (03:00 UTC = medianoche Buenos Aires).
- Vercel manda `Authorization: Bearer $CRON_SECRET` automáticamente si
  `CRON_SECRET` está seteada. **Sin `CRON_SECRET` el endpoint responde 401 a
  todo** (falla cerrado).

**Verificar el cron:**

- Vercel → Project → Cron Jobs: ver que esté listado y con corridas exitosas.
- Manual:
  ```bash
  curl -sS -H "Authorization: Bearer $CRON_SECRET" https://TU-APP/api/cron/attendance
  # → 200 + JSON resumen (employees, days, byStatus, unverifiedRemaining…)
  curl -sS -o /dev/null -w "%{http_code}\n" https://TU-APP/api/cron/attendance
  # → 401 (sin el secret)
  ```

---

## 5. Rutas y permisos

| Ruta | Acceso |
|---|---|
| `/login` | Público |
| `/` | Redirige según rol de la sesión (si no hay sesión → `/login`) |
| `/admin/**` | **ADMIN** (guard en el layout; middleware exige sesión) |
| `/supervisor/**` | **SUPERVISOR** (un supervisor solo ve/edita eventos donde lo es) |
| `/empleado` | **EMPLEADO** |
| `/api/auth/[...all]` | Público (endpoints de Better Auth: login, logout, sesión) |
| `/api/cron/attendance` | **CRON_SECRET** (no es por rol; header `Authorization: Bearer`) |

El middleware redirige a `/login` cualquier página sin cookie de sesión; el
chequeo de rol fino lo hace cada layout server-side. Las Server Actions pasan
todas por el wrapper `action(roles, fn)` (default denegar).

---

## 6. Rollback

**App (código):** Vercel → Deployments → elegir el deploy anterior → *Promote to
Production* (rollback instantáneo, sin rebuild).

**Datos:** Supabase → Database → Backups → *Point-in-time Restore* (o el backup
diario). Restaurá a un instante previo al problema.

**Esquema (SQL):** no hay "down" automático — cada cambio es un archivo nuevo en
`sql/`. Para revertir un cambio de esquema, escribí un archivo de compensación
(`sql/07_...sql`) con el `ALTER`/`DROP` inverso, entre `BEGIN;`/`COMMIT;`, y
volvé a verificar con `pnpm db:drift`. NUNCA edites un archivo `sql/` viejo.

> Si el deploy es el PRIMERO y todavía no hay datos reales, el rollback de
> esquema más simple es dropear el schema `public` y volver a aplicar desde el
> `00`. Con datos reales cargados, esto NO es opción: usá el restore de Supabase.

---

## 7. Checklist previo a producción

- [ ] Todas las variables de la sección 1 seteadas en Vercel.
- [ ] SQL `00`→`08` aplicados en orden; reconectado tras el `02`. (Fase 2:
      `07` y `08` van ANTES del deploy de payroll.)
- [ ] `SHOW timezone;` devuelve `UTC`.
- [ ] `pnpm db:drift` coincide con `sql/EXPECTED_DRIFT.md`.
- [ ] `pnpm db:seed:prod` corrido; admin logueado y password cambiada.
- [ ] Cron visible en Vercel y respondiendo 200 con el secret / 401 sin él.
- [ ] `BETTER_AUTH_SECRET` de 32+ caracteres (no el de ejemplo).
- [ ] `ADMIN_PASSWORD` / `ADMIN_EMAIL` borradas de Vercel tras el seed (opcional).
