# Baseline de `pnpm db:drift`

`prisma migrate diff` compara la DB real contra `schema.prisma`. Como buena
parte de nuestras decisiones de DB **no se pueden expresar en Prisma**, esa
comparación **nunca da vacío**. Este archivo congela el ruido esperado.

> **El chequeo es: comparar la salida contra este archivo, NO esperar salida
> vacía.** Cualquier línea que no esté acá es drift real y hay que mirarla.

**Nunca aplicar la salida de `db:drift` a ciegas.** Es un `--script` que
revierte decisiones tomadas a mano: aplicarlo devolvería los dos `ON DELETE`
a `SET NULL` en silencio.

Cómo comparar:

```bash
diff <(grep -E '^(-- |ALTER )' sql/EXPECTED_DRIFT.md) <(pnpm db:drift 2>/dev/null | grep -E '^(-- |ALTER )') && echo "sin drift real"
```

(el `-- ` y el `ALTER ` llevan espacio a propósito: así el grep no se come los
`---` de markdown)

Fecha del baseline: 2026-07-24 · Prisma 7.9.0 · PostgreSQL 16
(actualizado al sumar Better Auth y el motor de asistencia — ver más abajo)

---

## Salida esperada (7 statements)

```sql
-- DropForeignKey
ALTER TABLE "employee" DROP CONSTRAINT "employee_categoryId_fkey";
-- DropForeignKey
ALTER TABLE "time_entry" DROP CONSTRAINT "time_entry_assignmentId_fkey";
-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "employee_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "event_assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- RenameIndex
ALTER INDEX "employee_userid_active_uq" RENAME TO "employee_userId_key";
-- RenameIndex
ALTER INDEX "employee_userid_fk_idx" RENAME TO "employee_userId_idx";
-- RenameIndex
ALTER INDEX "time_entry_editedbyid_fk_idx" RENAME TO "time_entry_editedById_idx";
```

---

## Por qué cada ítem es esperado

### 1–2. `employee.categoryId` → RESTRICT (Prisma lo quiere en SET NULL)

Prisma deriva `ON DELETE SET NULL` automáticamente de que la relación es
opcional (`categoryId String?`). Lo cambiamos a mano en `00_tables.sql`.

**Motivo:** borrar una categoría que todavía tiene empleados les vaciaría el
campo en silencio y perderían su plantilla de horario sin dejar rastro. Para
dar de baja una categoría: soft delete + reasignar a mano.

Prisma no tiene forma de expresar un `onDelete` que contradiga la
opcionalidad de la relación sin cambiar el modelo, así que esto sale en el
diff **para siempre**.

### 3–4. `time_entry.assignmentId` → RESTRICT (Prisma lo quiere en SET NULL)

Mismo caso: relación opcional, Prisma asume `SET NULL`.

**Motivo:** el vínculo fichada↔turno es la evidencia que usa la liquidación.
Cancelar una asignación **no** es borrarla (es `status=CANCELLED` /
`deletedAt`), así que este `ON DELETE` no se dispara en operación normal. Está
en RESTRICT para el caso patológico: si alguien borra físicamente el turno,
preferimos que falle a perder el vínculo y descuadrar las horas del evento.

### 5. `employee_userid_active_uq` → renombre a `employee_userId_key`

Cosmético. Prisma ve el `@unique` de `Employee.userId` y espera un índice
llamado `employee_userId_key`. El nuestro se llama distinto porque **es
PARCIAL** (`WHERE "userId" IS NOT NULL AND "deletedAt" IS NULL`), para que un
empleado dado de baja libere su cuenta de login.

Prisma lo matchea por columnas y solo propone renombrarlo: un
`ALTER INDEX ... RENAME` **no toca el predicado**, así que aplicarlo sería
inocuo — pero innecesario, y el nombre actual documenta que es parcial.

### 6–7. `employee_userid_fk_idx` y `time_entry_editedbyid_fk_idx` → renombres

Cosméticos, misma lógica. Son los índices de cobertura de FK de la sección 2
de `01_indexes.sql`. Prisma los conoce (están declarados como `@@index` en el
schema) y solo quiere su convención de nombres. Usamos el sufijo `_fk_idx`
para que no colisionen con los del `00`.

---

## Better Auth (sql/03) — NO agrega drift

Las tablas `session`, `account`, `verification` y la columna `user.image` se
aplican con `sql/03_better_auth.sql` y **matchean el schema exactamente**, así
que el baseline sigue siendo esos mismos 7 statements — ni uno más.

Detalle a tener presente: los FK `session.userId` y `account.userId` van en
**`ON DELETE CASCADE` a propósito** (Better Auth borra de verdad). Eso NO
contradice la política RESTRICT del proyecto y, como coincide con lo que Prisma
deriva de la relación, **no aparece en el diff**. Si algún día el diff empezara
a proponer tocar esos dos FK, es drift real: alguien cambió el CASCADE en la DB.

---

## Asistencia + feriados (sql/04, sql/05) — NO agregan drift

`sql/04_attendance.sql` suma los valores `INCOMPLETE` y `UNVERIFIED` al enum
`AttendanceStatus` y la columna `attendance.warnings TEXT[]`. `sql/05_holidays.sql`
crea la tabla `holiday` con `date` unique total. Todo matchea el schema, así
que el baseline sigue siendo los mismos 7 statements.

Ojo con dos cosas que el diff NO ve: los valores de enum agregados (Prisma
compara el set, y coincide) y el `DEFAULT '{}'` de `warnings` — si el diff
empezara a proponer tocar el enum `AttendanceStatus` o la columna `warnings`,
es drift real.

`sql/06_timeentry_location.sql` suma las 8 columnas de ubicación a `time_entry`
(lat/lng/accuracy/denied de entrada y salida). Matchean el schema: sin drift.

---

## Lo que NO aparece en el diff (y no es que falte)

- **Los 10 CHECK constraints** de `01_indexes.sql`. `migrate diff` los ignora
  por completo. Que no salgan no significa que estén aplicados: verificarlos
  aparte con
  `SELECT conname FROM pg_constraint WHERE contype = 'c';`
- **La condición parcial de los 6 índices únicos** de la sección 1. Prisma
  compara columnas, no predicados. Si alguien recreara uno de esos índices
  como unique total, el drift **no lo detectaría** y recién se notaría cuando
  falle el alta de un empleado con el DNI de uno dado de baja.
