# PROFORMA — Merino Producciones

Sistema de gestión para empresa de eventos: empleados, asistencia, liquidación
de sueldos, eventos y caja.

Stack: Next.js 15 (App Router), TypeScript, Tailwind v4, Prisma 7, PostgreSQL
(Supabase), Better Auth.

Las reglas de arquitectura y las convenciones innegociables están en
[CLAUDE.md](CLAUDE.md). Este archivo es la parte operativa: cómo se siembra una
base, cómo se mantienen los feriados y qué hay que hacer después de entregar.

---

## Poner en marcha una base nueva

1. Aplicar los archivos de `sql/` **en orden** (`00_`, `01_`, … `09_`) desde el
   dashboard de Supabase. Nunca `prisma migrate`.
2. Correr el seed de producción (abajo).
3. Cargar el descuento por falta desde la app (abajo).

### Seed de producción

El seed **no lee `.env`**: `tsx` no lo carga. Las variables van exportadas en la
terminal, lo que además evita pisar la configuración local apuntada a otra base.

```bash
export DATABASE_URL="postgresql://postgres.REF:PASS@aws-0-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
export ADMIN_EMAIL="admin@dominio.com"
export ADMIN_PASSWORD="..."
export BETTER_AUTH_SECRET="el mismo que en Vercel"
export ADMIN_NAME="Nombre y Apellido"
```

```bash
pnpm db:seed:prod
```

`DATABASE_URL` tiene que ser el **pooler** (`:6543`) con
`?pgbouncer=true&connection_limit=1`. Si no, el seed aborta antes de escribir.
`DIRECT_URL` (`:5432`) solo la usa `pnpm db:drift`.

El seed crea **solo tres cosas**, y es idempotente:

- las 2 categorías con su plantilla de horario,
- los feriados de todos los años cargados,
- un usuario ADMIN (`ADMIN_NAME` es el nombre que se ve en el pie del menú).

No crea empleados, eventos, sueldos ni movimientos de caja. Los datos de prueba
viven en `seed.dev.ts`, que aborta si la base no es local.

### Después del seed: el descuento por falta

**El seed NO carga el descuento por falta.** Recién sembrada, la base tiene cero
configuraciones de liquidación, y esta consulta da `0`:

```sql
SELECT count(*) FROM payroll_config WHERE "effectiveTo" IS NULL AND "deletedAt" IS NULL;
```

Hay que cargarlo **desde la app**, en **Caja → Config**, antes de liquidar el
primer mes. Si no se carga, el descuento por día ausente queda en `$0` y los
recibos salen sin descontar las faltas.

Una vez cargado, esa misma consulta tiene que dar exactamente `1`. Si diera 2 o
más, hay más de una configuración vigente y el descuento aplicado sería
indeterminado.

---

## Feriados

Viven en `prisma/seed-shared.ts`, agrupados por año y unidos en `FERIADOS`.

**Por qué importa mantenerlos al día:** un feriado que no está cargado se
comporta como día laborable. El motor de asistencia no encuentra el `Holiday`,
cae en la rama del horario habitual y, sin fichada, marca el día como `ABSENT`
— o sea que le descuenta el día a cada empleado que tenía turno. Un feriado
olvidado no es un detalle visual: es plata mal descontada, y recién se nota
cuando sale el recibo.

Hoy no hay pantalla para administrarlos.

### Agregar un año

1. En `prisma/seed-shared.ts`, copiar el bloque `FERIADOS_2027` y adaptarlo:

   ```ts
   const FERIADOS_2028 = [
     { date: '2028-01-01', label: 'Año Nuevo' },
     // …
   ] as const
   ```

2. Sumarlo a la lista final:

   ```ts
   export const FERIADOS = [...FERIADOS_2026, ...FERIADOS_2027, ...FERIADOS_2028]
   ```

3. Actualizar el test `prisma/seed-shared.test.ts` (espera los años y la
   cantidad por año, justamente para que no se agregue medio año).

4. Re-correr `pnpm db:seed:prod` con las variables apuntando a producción. El
   upsert es por fecha: siembra solo lo nuevo, no duplica ni pisa lo demás.

### Tres cuidados al armar la lista

- **La fecha que se carga es la EFECTIVA**, el día que la gente no trabaja. Para
  los feriados trasladables eso no es la fecha original: si el traslado lo mueve
  al lunes, el martes original es día laborable y el lunes no. Cargar la fecha
  original descuenta un día que no correspondía y deja de descontar uno que sí.
- **Carnaval y Viernes Santo dependen de Pascua**, así que cambian todos los
  años. Hay que sacarlos del calendario, no copiarlos del año anterior.
- **Los "días no laborables con fines turísticos" (los puentes) no están en la
  lista.** Se fijan por decreto, normalmente el año anterior, y no son
  feriados de calendario. Cuando salgan, se agregan igual que cualquier otro.

### Agregar uno suelto sin tocar el código

```sql
INSERT INTO holiday (id, date, label, "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, DATE '2027-12-31', 'Feriado puente', now(), now())
ON CONFLICT (date) DO UPDATE SET label = EXCLUDED.label;
```

Conviene igual reflejarlo después en el seed, para que una base nueva lo tenga.

---

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm test` | Tests unitarios (dominio, formato, feriados) |
| `pnpm test:int` | Tests de integración — necesitan un Postgres real en `DATABASE_URL` |
| `pnpm build` | Build de producción |
| `pnpm db:seed:prod` | Seed de producción (ver arriba) |
| `pnpm db:seed:dev` | Seed de desarrollo — solo contra base local |
| `pnpm db:drift` | Compara la base real contra el schema. Solo lectura; su salida se compara contra `sql/EXPECTED_DRIFT.md` |

Antes de dar una tarea por terminada: `pnpm test`, `pnpm test:int` y `pnpm build`
en verde.
