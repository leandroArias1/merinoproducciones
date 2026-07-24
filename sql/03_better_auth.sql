-- ═══════════════════════════════════════════════════════════════
-- PROFORMA · sql/03_better_auth.sql
-- Tablas de Better Auth: session, account, verification + columna user.image.
--
-- Modelos derivados de `@better-auth/cli generate` (fuente de verdad),
-- adaptados a las convenciones del proyecto: timestamps TIMESTAMPTZ.
--
-- ESTAS TABLAS SON DE BETTER AUTH:
--   · NO llevan soft delete (no hay "deletedAt").
--   · NO entran en la política de ON DELETE RESTRICT del resto del proyecto.
--     Better Auth borra de verdad (logout, expiración de sesión, revocación
--     de credencial), así que session/account referencian a "user" en
--     CASCADE: si se borra el usuario, se van sus sesiones y credenciales.
--   · `verification` no tiene FK: es efímera (tokens de verificación/reset).
--
-- Ejecutar en Supabase DESPUÉS de sql/00_tables.sql. Todo en una transacción.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- AlterTable: avatar (Better Auth / OAuth). El resto de columnas de "user"
-- (incluida role) ya se crearon en 00_tables.sql.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "image" TEXT;

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMPTZ,
    "refreshTokenExpiresAt" TIMESTAMPTZ,
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Uniques TOTALES (no parciales): estas tablas no tienen soft delete.
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- AddForeignKey
-- CASCADE a propósito (ver cabecera): NO es la política RESTRICT del proyecto.
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
