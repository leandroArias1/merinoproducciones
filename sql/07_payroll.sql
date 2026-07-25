-- ═══════════════════════════════════════════════════════════════
-- PROFORMA · sql/07_payroll.sql  (Fase 2 — Liquidaciones)
-- Enums, tablas, índices, FKs + índices únicos PARCIALES y CHECKs.
--
-- La parte de tablas/índices/FKs se generó offline con:
--   prisma migrate diff --from-config-datasource \
--     --to-schema=prisma/schema.prisma --script
-- (la DB tenía Fase 1 sin payroll, así que el diff ES el delta de payroll)
-- y se recortó a mano: se EXCLUYÓ el ruido de EXPECTED_DRIFT (los DROP/ADD de
-- employee_categoryId y time_entry_assignmentId y los RENAME de índices, que
-- son decisiones de Fase 1, no de payroll).
--
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de sql/06. Aplicar UNA vez.
-- Los ON DELETE ya salen correctos del diff (RESTRICT en las FK de negocio,
-- SET NULL en los punteros a "user"), así que NO hay que corregirlos a mano.
--
-- Plata SIEMPRE en centavos (BIGINT). Ver src/lib/domain/payroll.ts.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ── Enums de estado ──
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('OPEN', 'CLOSED', 'PAID');
CREATE TYPE "PayrollItemStatus" AS ENUM ('DRAFT', 'READY', 'BLOCKED', 'CLOSED', 'PAID');
CREATE TYPE "PayrollLineKind" AS ENUM ('BASE', 'DEDUCTION', 'ADJUSTMENT');

-- ── Tablas ──

-- Sueldo mensual por empleado, versionado (como work_schedule).
CREATE TABLE "salary_history" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "monthlyCents" BIGINT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "salary_history_pkey" PRIMARY KEY ("id")
);

-- Config global versionada (hoy solo el descuento por falta).
CREATE TABLE "payroll_config" (
    "id" TEXT NOT NULL,
    "absentDeductionCents" BIGINT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "payroll_config_pkey" PRIMARY KEY ("id")
);

-- Período mensual (contenedor de recibos).
CREATE TABLE "payroll_period" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMPTZ,
    "closedById" TEXT,
    "paidAt" TIMESTAMPTZ,
    "paidById" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "payroll_period_pkey" PRIMARY KEY ("id")
);

-- Recibo por (empleado, período). Snapshot congelado al CLOSED.
CREATE TABLE "payroll_item" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "status" "PayrollItemStatus" NOT NULL DEFAULT 'DRAFT',
    "baseCents" BIGINT NOT NULL DEFAULT 0,
    "deductionCents" BIGINT NOT NULL DEFAULT 0,
    "netCents" BIGINT NOT NULL DEFAULT 0,
    "absentDays" INTEGER NOT NULL DEFAULT 0,
    "closedAt" TIMESTAMPTZ,
    "closedById" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "payroll_item_pkey" PRIMARY KEY ("id")
);

-- Línea del recibo. DERIVADA (sin deletedAt): se regenera al (re)cerrar el ítem.
CREATE TABLE "payroll_line" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "kind" "PayrollLineKind" NOT NULL,
    "concept" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_line_pkey" PRIMARY KEY ("id")
);

-- ── Índices comunes (cobertura de FK + queries). Todas las FK quedan indexadas. ──
CREATE INDEX "salary_history_employeeId_effectiveFrom_effectiveTo_idx" ON "salary_history"("employeeId", "effectiveFrom", "effectiveTo");
CREATE INDEX "payroll_period_closedById_idx" ON "payroll_period"("closedById");
CREATE INDEX "payroll_period_paidById_idx" ON "payroll_period"("paidById");
CREATE INDEX "payroll_period_status_idx" ON "payroll_period"("status");
CREATE INDEX "payroll_item_periodId_idx" ON "payroll_item"("periodId");
CREATE INDEX "payroll_item_employeeId_idx" ON "payroll_item"("employeeId");
CREATE INDEX "payroll_item_closedById_idx" ON "payroll_item"("closedById");
CREATE INDEX "payroll_line_itemId_idx" ON "payroll_line"("itemId");

-- ── Foreign keys (ON DELETE del diff: RESTRICT negocio / SET NULL punteros a user) ──
ALTER TABLE "salary_history" ADD CONSTRAINT "salary_history_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_period" ADD CONSTRAINT "payroll_period_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payroll_period" ADD CONSTRAINT "payroll_period_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payroll_item" ADD CONSTRAINT "payroll_item_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payroll_item" ADD CONSTRAINT "payroll_item_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "payroll_period"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_item" ADD CONSTRAINT "payroll_item_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_line" ADD CONSTRAINT "payroll_line_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "payroll_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────────────────────────────────────────────────────────────
-- ÍNDICES ÚNICOS PARCIALES (versionado + unicidad de negocio).
-- Prisma no expresa parciales → van a mano y NO como @@unique (por eso el
-- código usa findFirst, nunca findUnique, sobre estas claves).
-- ───────────────────────────────────────────────────────────────

-- SalaryHistory: UN solo sueldo vigente por empleado (effectiveTo IS NULL).
CREATE UNIQUE INDEX IF NOT EXISTS salary_history_vigente_uq
  ON salary_history ("employeeId")
  WHERE "effectiveTo" IS NULL AND "deletedAt" IS NULL;

-- PayrollConfig: UNA sola config vigente global. El índice sobre la expresión
-- constante (true) permite a lo sumo una fila con effectiveTo/deletedAt NULL.
CREATE UNIQUE INDEX IF NOT EXISTS payroll_config_vigente_uq
  ON payroll_config ((true))
  WHERE "effectiveTo" IS NULL AND "deletedAt" IS NULL;

-- PayrollPeriod: un período por (año, mes) entre los activos.
CREATE UNIQUE INDEX IF NOT EXISTS payroll_period_yearmonth_uq
  ON payroll_period ("year", "month")
  WHERE "deletedAt" IS NULL;

-- PayrollItem: un recibo por (período, empleado) entre los activos.
CREATE UNIQUE INDEX IF NOT EXISTS payroll_item_period_employee_uq
  ON payroll_item ("periodId", "employeeId")
  WHERE "deletedAt" IS NULL;

-- ───────────────────────────────────────────────────────────────
-- CHECK CONSTRAINTS (invariantes del dominio).
-- amountCents de payroll_line NO se acota: las deducciones son negativas.
-- ───────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE payroll_period ADD CONSTRAINT payroll_period_month_chk
    CHECK ("month" BETWEEN 1 AND 12);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE salary_history ADD CONSTRAINT salary_history_amount_chk
    CHECK ("monthlyCents" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE salary_history ADD CONSTRAINT salary_history_effective_chk
    CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE payroll_config ADD CONSTRAINT payroll_config_amount_chk
    CHECK ("absentDeductionCents" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE payroll_config ADD CONSTRAINT payroll_config_effective_chk
    CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE payroll_item ADD CONSTRAINT payroll_item_amounts_chk
    CHECK ("baseCents" >= 0 AND "deductionCents" >= 0 AND "netCents" >= 0 AND "absentDays" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
