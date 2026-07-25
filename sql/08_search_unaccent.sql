-- ═══════════════════════════════════════════════════════════════
-- PROFORMA · sql/08_search_unaccent.sql
-- Búsqueda de empleados acento-INSENSIBLE (follow-up de Fase 1).
--
-- Aparte del 07 a propósito: no es de liquidaciones, y agrega dos EXTENSIONES
-- (unaccent, pg_trgm) que en Supabase conviene revisar/aplicar por separado.
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
--
-- Motivo: el buscador de Bloque 5 usa ILIKE, que es case-insensitive pero
-- acento-SENSIBLE: "benitez" no matchea "Benítez". unaccent lo resuelve.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent() NO es IMMUTABLE de por sí (depende del diccionario), así que no se
-- puede indexar directo. Este wrapper fija el diccionario y lo declara IMMUTABLE
-- para poder crear el índice funcional. Patrón estándar de Postgres.
CREATE OR REPLACE FUNCTION f_unaccent(text)
  RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent', $1) $$;

-- Índices trigram GIN sobre nombre/apellido sin acentos: soportan el ILIKE
-- '%término%' (substring) que usa el buscador. Parciales: solo empleados activos.
CREATE INDEX IF NOT EXISTS employee_lastname_unaccent_trgm
  ON employee USING gin (f_unaccent("lastName") gin_trgm_ops)
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS employee_firstname_unaccent_trgm
  ON employee USING gin (f_unaccent("firstName") gin_trgm_ops)
  WHERE "deletedAt" IS NULL;

COMMIT;
