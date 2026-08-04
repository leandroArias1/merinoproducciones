-- ═══════════════════════════════════════════════════════════════
-- PROFORMA · sql/10_employee_extra.sql
-- Fecha de nacimiento y alias bancario del empleado.
--
-- SE APLICA SOBRE UNA BASE CON DATOS REALES. Por eso las dos columnas son
-- NULL-ables y sin DEFAULT: en Postgres eso es una operación de metadata —
-- no reescribe la tabla, no recorre las filas, no puede fallar por datos
-- existentes. Los empleados ya cargados quedan con NULL en las dos y no
-- cambian en nada más.
--
-- No hay NOT NULL, ni índice, ni constraint, ni FK: nada que pueda chocar
-- con una fila que ya está.
--
-- ES RETROCOMPATIBLE con el código que esté deployado en ese momento: Prisma
-- pide las columnas que declara su modelo, y el modelo viejo no las conoce.
-- Por eso este archivo va ANTES del deploy, no después.
--
--   · birthDate — DATE (día puro). Lo valida la app: no futura, entre 16 y
--     100 años. Sin CHECK en la DB a propósito: la edad mínima es una regla
--     de negocio que puede cambiar, y un CHECK obligaría a un ALTER para
--     moverla.
--   · alias — alias bancario (6-20 caracteres) o CBU/CVU (22 dígitos). TEXT
--     libre en la DB, con el formato validado en la app. Sin UNIQUE: dos
--     personas pueden compartir cuenta (familiares), y un UNIQUE trabaría
--     una carga legítima.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE employee ADD COLUMN "birthDate" DATE;
ALTER TABLE employee ADD COLUMN alias TEXT;

COMMIT;
