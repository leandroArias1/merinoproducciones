-- ═══════════════════════════════════════════════════════════════
-- PROFORMA · sql/06_timeentry_location.sql
-- Ubicación de las fichadas.
--
-- POLÍTICA: se REGISTRA la ubicación, no se BLOQUEA por ella. Un armador a las
-- 6 AM en un predio sin señal no puede quedar trabado: si no puede fichar, la
-- empresa vuelve al WhatsApp. Por eso todas las columnas son nullable y hay un
-- flag de "permiso denegado" — se ficha igual y se registra el estado.
--
-- Una fichada tiene DOS momentos (entrada/salida), cada uno con su ubicación.
-- Coordenadas como DOUBLE PRECISION (no es plata: la regla de enteros no aplica).
--
-- Ejecutar en Supabase DESPUÉS de sql/00_tables.sql. Idempotente.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE "time_entry"
  ADD COLUMN IF NOT EXISTS "checkInLat" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "checkInLng" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "checkInAccuracy" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "checkInLocationDenied" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "checkOutLat" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "checkOutLng" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "checkOutAccuracy" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "checkOutLocationDenied" BOOLEAN NOT NULL DEFAULT false;

COMMIT;
