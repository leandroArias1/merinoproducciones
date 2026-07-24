-- ═══════════════════════════════════════════════════════════════
-- PROFORMA · sql/02_timezone.sql
-- Fija la zona horaria de la base en UTC.
--
-- POR QUÉ ESTO NO ES COSMÉTICO:
-- El driver adapter de Prisma manda los timestamps SIN marca de zona. Si la
-- zona de sesión de la base no es UTC, Postgres los interpreta en ESA zona y
-- guarda un instante corrido. Al leer, Prisma aplica la conversión inversa,
-- así que el round-trip por Prisma da bien y el error queda TAPADO: solo se
-- ve desde SQL crudo, un cron, un reporte o cualquier otro cliente.
--
-- Verificado en Postgres 16 con zona de sesión -03: un turno guardado como
-- 08:00 hora Buenos Aires (11:00Z) terminaba almacenado como 14:00Z, y
-- Prisma lo releía como 11:00Z igual.
--
-- Supabase ya viene en UTC por defecto, así que esto es cinturón y tiradores.
-- Pero la regla "fechas en UTC en la DB" tiene que estar garantizada por la
-- base, no por una default que alguien puede cambiar sin darse cuenta.
--
-- Solo afecta a las sesiones NUEVAS: después de correrlo hay que reconectar.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'UTC');
END $$;

COMMIT;

-- Verificación (en una sesión NUEVA, debe devolver UTC):
--   SHOW timezone;
