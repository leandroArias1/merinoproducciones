-- ═══════════════════════════════════════════════════════════════
-- PROFORMA · sql/09_finance.sql  (Fase 3 — Caja / Finanzas)
-- Enums, columnas de Event, tablas, índices, FKs + parciales y CHECKs.
--
-- Tablas/columnas/FKs generadas offline con:
--   prisma migrate diff --from-config-datasource \
--     --to-schema=prisma/schema.prisma --script
-- (la DB tenía 00–08 sin finanzas → el diff ES el delta) y recortado del ruido
-- de EXPECTED_DRIFT (DROP/ADD de employee_categoryId, time_entry_assignmentId y
-- los RENAME).
--
-- Los ON DELETE salen RESTRICT del diff (se declaró `onDelete: Restrict`
-- EXPLÍCITO en el schema, aunque las FK son opcionales): así NO agregan drift.
--
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de sql/08. Aplicar UNA vez.
-- Plata SIEMPRE en centavos (BIGINT). Ver src/lib/domain/finance.ts.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ── Enums ──
CREATE TYPE "PartyKind" AS ENUM ('CLIENT', 'PROVIDER');
CREATE TYPE "ExpenseStatus" AS ENUM ('PENDING', 'PAID');
CREATE TYPE "ExpenseCategory" AS ENUM ('TRANSPORT', 'EQUIPMENT', 'VENUE', 'SUPPLIES', 'OTHER');
CREATE TYPE "CashDirection" AS ENUM ('INCOME', 'EXPENSE');
CREATE TYPE "CashCategory" AS ENUM ('CLIENT_PAYMENT', 'EXPENSE_PAYMENT', 'SALARY', 'OTHER');

-- ── Event: precio pactado + cliente (el evento es la cuenta por cobrar) ──
ALTER TABLE "event"
  ADD COLUMN "agreedCents" BIGINT,
  ADD COLUMN "clientId" TEXT;

-- ── Tablas ──

-- Clientes y proveedores (una tabla con `kind`).
CREATE TABLE "party" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PartyKind" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "party_pkey" PRIMARY KEY ("id")
);

-- Gasto / cuenta por pagar. PENDING = debe; PAID = ya movió caja.
CREATE TABLE "expense" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "incurredOn" DATE NOT NULL,
    "category" "ExpenseCategory" NOT NULL DEFAULT 'OTHER',
    "status" "ExpenseStatus" NOT NULL DEFAULT 'PENDING',
    "providerId" TEXT,
    "eventId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "expense_pkey" PRIMARY KEY ("id")
);

-- Libro de caja de TOTAL ÚNICO. saldo = Σ INCOME − Σ EXPENSE.
CREATE TABLE "cash_movement" (
    "id" TEXT NOT NULL,
    "direction" "CashDirection" NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "occurredOn" DATE NOT NULL,
    "category" "CashCategory" NOT NULL DEFAULT 'OTHER',
    "note" TEXT,
    "eventId" TEXT,
    "expenseId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "cash_movement_pkey" PRIMARY KEY ("id")
);

-- ── Índices comunes (cobertura de FK + queries). Todas las FK indexadas. ──
CREATE INDEX "party_kind_idx" ON "party"("kind");
CREATE INDEX "party_deletedAt_idx" ON "party"("deletedAt");
CREATE INDEX "expense_providerId_idx" ON "expense"("providerId");
CREATE INDEX "expense_eventId_idx" ON "expense"("eventId");
CREATE INDEX "expense_status_idx" ON "expense"("status");
CREATE INDEX "expense_deletedAt_idx" ON "expense"("deletedAt");
CREATE INDEX "cash_movement_eventId_idx" ON "cash_movement"("eventId");
CREATE INDEX "cash_movement_expenseId_idx" ON "cash_movement"("expenseId");
CREATE INDEX "cash_movement_occurredOn_idx" ON "cash_movement"("occurredOn");
CREATE INDEX "cash_movement_direction_idx" ON "cash_movement"("direction");
CREATE INDEX "cash_movement_deletedAt_idx" ON "cash_movement"("deletedAt");
CREATE INDEX "event_clientId_idx" ON "event"("clientId");

-- ── Foreign keys (ON DELETE RESTRICT — del schema, explícito) ──
ALTER TABLE "event" ADD CONSTRAINT "event_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense" ADD CONSTRAINT "expense_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense" ADD CONSTRAINT "expense_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_movement" ADD CONSTRAINT "cash_movement_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_movement" ADD CONSTRAINT "cash_movement_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────────────────────────────────────────────────────────────
-- ÍNDICE ÚNICO PARCIAL: no duplicar cliente/proveedor activo por nombre.
-- Prisma no expresa parciales → a mano, y NO como @@unique (el código usa
-- findFirst, nunca findUnique, sobre esta clave).
-- ───────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS party_name_kind_active_uq
  ON party ("name", "kind")
  WHERE "deletedAt" IS NULL;

-- ───────────────────────────────────────────────────────────────
-- CHECK CONSTRAINTS (montos ≥ 0).
-- ───────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE expense ADD CONSTRAINT expense_amount_chk CHECK ("amountCents" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE cash_movement ADD CONSTRAINT cash_movement_amount_chk CHECK ("amountCents" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE event ADD CONSTRAINT event_agreed_chk CHECK ("agreedCents" IS NULL OR "agreedCents" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
