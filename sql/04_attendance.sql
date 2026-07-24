-- ═══════════════════════════════════════════════════════════════
-- PROFORMA · sql/04_attendance.sql
-- Nuevos status de asistencia + columna de warnings.
--
--   · INCOMPLETE: fichó y nunca cerró la fichada (armado de madrugada).
--   · UNVERIFIED: asignación sin fichada ni confirmación del supervisor.
--                 BLOQUEA el cierre de un período de payroll.
--   · attendance.warnings: anomalías para reconciliación humana.
--
-- Ejecutar en Supabase DESPUÉS de sql/00_tables.sql. Idempotente.
--
-- Nota PG: `ALTER TYPE ... ADD VALUE` puede ir dentro de una transacción en
-- PG12+ SIEMPRE que el valor nuevo NO se USE en la misma transacción. Acá solo
-- se agregan y se agrega una columna (no se usan), así que BEGIN/COMMIT es OK.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

ALTER TYPE "AttendanceStatus" ADD VALUE IF NOT EXISTS 'INCOMPLETE';
ALTER TYPE "AttendanceStatus" ADD VALUE IF NOT EXISTS 'UNVERIFIED';

ALTER TABLE "attendance"
  ADD COLUMN IF NOT EXISTS "warnings" TEXT[] NOT NULL DEFAULT '{}';

COMMIT;
