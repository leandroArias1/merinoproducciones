-- ═══════════════════════════════════════════════════════════════
-- PROFORMA · sql/01_indexes.sql
-- Índices únicos PARCIALES + CHECK constraints.
--
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de sql/00_tables.sql.
--
-- Alcance de este archivo: SOLO lo que Prisma no puede expresar y por lo
-- tanto no sale del `migrate diff`. Los índices comunes y los uniques
-- totales viven en 00_tables.sql (generados desde @@index/@@unique); acá
-- NO se repiten para no crear índices duplicados.
--
-- Nota de nombres: las TABLAS son snake_case (@@map); las COLUMNAS mantienen
-- el nombre camelCase de Prisma, por eso van entre comillas dobles.
--
-- Idempotente: los índices usan IF NOT EXISTS y los CHECK van en bloques DO
-- que ignoran el error si ya existen. Se puede re-ejecutar.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────
-- 1) ÍNDICES ÚNICOS PARCIALES  (WHERE "deletedAt" IS NULL)
--    Un valor dado de baja (soft delete) libera la unicidad y se puede
--    volver a usar. Prisma no puede expresar esto, por eso está a mano.
--
--    NO están acá (a propósito):
--      • user."email"                    → sin soft delete, unique total en el 00
--      • attendance(employeeId,workDate) → sin soft delete, unique TOTAL en el
--        00; es la clave del upsert atómico del cron de ausencias.
-- ───────────────────────────────────────────────────────────────

-- Employee: DNI/CUIL único entre los activos
CREATE UNIQUE INDEX IF NOT EXISTS employee_documentid_active_uq
  ON employee ("documentId")
  WHERE "deletedAt" IS NULL;

-- Employee: una cuenta de login ↔ un empleado activo.
-- Respalda la relación 1:1 de Prisma (Employee.userId @unique); el unique
-- total que generaba el diff fue eliminado del 00 a favor de este.
CREATE UNIQUE INDEX IF NOT EXISTS employee_userid_active_uq
  ON employee ("userId")
  WHERE "userId" IS NOT NULL AND "deletedAt" IS NULL;

-- EmployeeCategory: nombre único entre las activas
CREATE UNIQUE INDEX IF NOT EXISTS employee_category_name_active_uq
  ON employee_category ("name")
  WHERE "deletedAt" IS NULL;

-- CategoryDay: no duplicar el mismo inicio de turno en (categoría, día).
-- Se permiten turnos partidos con distinto startMinute.
CREATE UNIQUE INDEX IF NOT EXISTS category_day_slot_active_uq
  ON category_day ("categoryId", "dayOfWeek", "startMinute")
  WHERE "deletedAt" IS NULL;

-- WorkSchedule: un tramo efectivo por (empleado, día, vigencia, inicio)
CREATE UNIQUE INDEX IF NOT EXISTS work_schedule_slot_active_uq
  ON work_schedule ("employeeId", "dayOfWeek", "effectiveFrom", "startMinute")
  WHERE "deletedAt" IS NULL;

-- EventAssignment: no duplicar exactamente el mismo turno del empleado en el
-- evento. Varias asignaciones el mismo día siguen permitidas: cambia startAt.
CREATE UNIQUE INDEX IF NOT EXISTS event_assignment_slot_active_uq
  ON event_assignment ("eventId", "employeeId", "startAt")
  WHERE "deletedAt" IS NULL;


-- ───────────────────────────────────────────────────────────────
-- 2) ÍNDICES DE FK SIN COBERTURA EN EL 00
--    Postgres NO indexa las FKs solo, y Prisma tampoco lo hace en
--    PostgreSQL: solo crea lo que está declarado como @@index/@@unique.
--    Estas dos columnas quedaron sin índice propio ni como primera columna
--    de ningún compuesto del 00. Sin ellos, cada DELETE/UPDATE sobre "user"
--    o sobre "event_assignment" dispara un seq scan de la tabla hija.
--
--    Nombres con sufijo _fk_idx para no colisionar con los del 00.
-- ───────────────────────────────────────────────────────────────

-- employee."userId": su único índice era el UNIQUE total que eliminamos del
-- 00. El parcial de la sección 1 NO sirve acá: su predicado incluye
-- "deletedAt" IS NULL, que el chequeo de integridad referencial no puede
-- probar, así que el planner nunca lo usa para la FK.
CREATE INDEX IF NOT EXISTS employee_userid_fk_idx
  ON employee ("userId");

-- time_entry."editedById": nunca tuvo índice (el schema no declara @@index
-- sobre esta columna).
-- Nota: si time_entry crece mucho, conviene cambiarlo por un parcial
-- (WHERE "editedById" IS NOT NULL), ya que la mayoría de las fichadas no se
-- editan a mano y btree igual indexa los NULL.
CREATE INDEX IF NOT EXISTS time_entry_editedbyid_fk_idx
  ON time_entry ("editedById");


-- ───────────────────────────────────────────────────────────────
-- 3) CHECK CONSTRAINTS
--    Invariantes que el dominio asume. Ninguno contradice los DEFAULT del
--    00 (el único DEFAULT numérico es attendance."workedMinutes" = 0, que
--    satisface >= 0).
--
--    OJO: en horarios NO se exige endMinute > startMinute — el cruce de
--    medianoche (desarmado 00:00–05:00) es válido. Solo se acotan rangos.
-- ───────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE category_day ADD CONSTRAINT category_day_dow_chk
    CHECK ("dayOfWeek" BETWEEN 0 AND 6);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE category_day ADD CONSTRAINT category_day_minutes_chk
    CHECK ("startMinute" BETWEEN 0 AND 1439 AND "endMinute" BETWEEN 1 AND 1440);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE work_schedule ADD CONSTRAINT work_schedule_dow_chk
    CHECK ("dayOfWeek" BETWEEN 0 AND 6);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE work_schedule ADD CONSTRAINT work_schedule_minutes_chk
    CHECK ("startMinute" BETWEEN 0 AND 1439 AND "endMinute" BETWEEN 1 AND 1440);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE work_schedule ADD CONSTRAINT work_schedule_effective_chk
    CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE event ADD CONSTRAINT event_time_chk
    CHECK ("endAt" > "startAt");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE event_assignment ADD CONSTRAINT event_assignment_time_chk
    CHECK ("endAt" > "startAt");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE time_entry ADD CONSTRAINT time_entry_time_chk
    CHECK ("checkOut" IS NULL OR "checkOut" > "checkIn");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE attendance ADD CONSTRAINT attendance_worked_chk
    CHECK ("workedMinutes" >= 0 AND ("expectedMinutes" IS NULL OR "expectedMinutes" >= 0));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE leave_request ADD CONSTRAINT leave_request_range_chk
    CHECK ("dateTo" >= "dateFrom");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
