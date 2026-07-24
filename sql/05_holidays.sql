-- ═══════════════════════════════════════════════════════════════
-- PROFORMA · sql/05_holidays.sql
-- Tabla de feriados.
--
-- Tabla, NO lista calculada en código: en Argentina hay feriados
-- trasladables y "puentes turísticos" por decreto que cambian cada año.
-- El motor de asistencia recibe `isHoliday` ya resuelto; el caller consulta
-- esta tabla. Los feriados 2026 se cargan en el seed.
--
-- Datos de referencia: sin soft delete, unique TOTAL de `date`
-- (una fila por fecha).
--
-- Ejecutar en Supabase (orden libre respecto de 01-04; no depende de ellos).
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- CreateTable
CREATE TABLE "holiday" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "holiday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique TOTAL (la tabla no tiene soft delete).
CREATE UNIQUE INDEX "holiday_date_key" ON "holiday"("date");

COMMIT;
