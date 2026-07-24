-- ═══════════════════════════════════════════════════════════════
-- PROFORMA · sql/00_tables.sql
-- Enums, tablas, índices (no parciales) y foreign keys.
--
-- Generado offline con:
--   npx prisma migrate diff --from-empty \
--     --to-schema-datamodel prisma/schema.prisma --script
-- y luego CORREGIDO A MANO (ver marcas [EDIT] más abajo).
--
-- Ejecutar en el SQL Editor de Supabase ANTES de sql/01_indexes.sql.
-- Todo va en una transacción: o entra completo o no entra nada.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'SUPERVISOR', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('MONTHLY', 'DAILY', 'HOURLY', 'PER_EVENT');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PLANNED', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TimeEntrySource" AS ENUM ('MANUAL', 'DEVICE', 'IMPORT');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'JUSTIFIED', 'ON_LEAVE', 'HOLIDAY');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('GENERATED', 'MANUAL');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('VACATION', 'SICK', 'UNPAID', 'SPECIAL');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "role" "UserRole" NOT NULL DEFAULT 'EMPLOYEE',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "employee_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_day" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "category_day_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "photoUrl" TEXT,
    "position" TEXT,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'MONTHLY',
    "hireDate" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "categoryId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_schedule" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "isException" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "work_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "client" TEXT,
    "venue" TEXT,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "startAt" TIMESTAMPTZ NOT NULL,
    "endAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_assignment" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "role" TEXT,
    "isSupervisor" BOOLEAN NOT NULL DEFAULT false,
    "workDate" DATE NOT NULL,
    "startAt" TIMESTAMPTZ NOT NULL,
    "endAt" TIMESTAMPTZ NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "event_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entry" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "checkIn" TIMESTAMPTZ NOT NULL,
    "checkOut" TIMESTAMPTZ,
    "source" "TimeEntrySource" NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "assignmentId" TEXT,
    "editedById" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "time_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- Sin "deletedAt": resumen derivado, se recalcula y se pisa (upsert).
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "source" "AttendanceSource" NOT NULL DEFAULT 'GENERATED',
    "workedMinutes" INTEGER NOT NULL DEFAULT 0,
    "expectedMinutes" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_request" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "LeaveType" NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "dateFrom" DATE NOT NULL,
    "dateTo" DATE NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "leave_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- "user" no tiene soft delete → unique total (lo maneja Better Auth).
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "employee_category_deletedAt_idx" ON "employee_category"("deletedAt");

-- CreateIndex
CREATE INDEX "category_day_categoryId_idx" ON "category_day"("categoryId");

-- [EDIT] ELIMINADO: CREATE UNIQUE INDEX "employee_userId_key" ON "employee"("userId");
--   La unicidad de employee."userId" vive en 01_indexes.sql como índice
--   PARCIAL (WHERE "userId" IS NOT NULL AND "deletedAt" IS NULL), para que
--   un empleado dado de baja libere su cuenta de login.

-- CreateIndex
CREATE INDEX "employee_categoryId_idx" ON "employee"("categoryId");

-- CreateIndex
CREATE INDEX "employee_active_idx" ON "employee"("active");

-- CreateIndex
CREATE INDEX "employee_deletedAt_idx" ON "employee"("deletedAt");

-- CreateIndex
CREATE INDEX "work_schedule_employeeId_dayOfWeek_idx" ON "work_schedule"("employeeId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "work_schedule_employeeId_effectiveFrom_effectiveTo_idx" ON "work_schedule"("employeeId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "event_status_idx" ON "event"("status");

-- CreateIndex
CREATE INDEX "event_startAt_idx" ON "event"("startAt");

-- CreateIndex
CREATE INDEX "event_deletedAt_idx" ON "event"("deletedAt");

-- CreateIndex
CREATE INDEX "event_assignment_employeeId_workDate_idx" ON "event_assignment"("employeeId", "workDate");

-- CreateIndex
CREATE INDEX "event_assignment_eventId_idx" ON "event_assignment"("eventId");

-- CreateIndex
CREATE INDEX "event_assignment_workDate_idx" ON "event_assignment"("workDate");

-- CreateIndex
CREATE INDEX "time_entry_employeeId_workDate_idx" ON "time_entry"("employeeId", "workDate");

-- CreateIndex
CREATE INDEX "time_entry_assignmentId_idx" ON "time_entry"("assignmentId");

-- CreateIndex
CREATE INDEX "time_entry_deletedAt_idx" ON "time_entry"("deletedAt");

-- CreateIndex
CREATE INDEX "attendance_workDate_idx" ON "attendance"("workDate");

-- CreateIndex
CREATE INDEX "attendance_status_idx" ON "attendance"("status");

-- CreateIndex
-- UNIQUE TOTAL (no parcial): attendance no tiene soft delete. Es la clave
-- del `upsert` atómico del cron nocturno del motor de ausencias.
CREATE UNIQUE INDEX "attendance_employeeId_workDate_key" ON "attendance"("employeeId", "workDate");

-- CreateIndex
CREATE INDEX "leave_request_employeeId_dateFrom_dateTo_idx" ON "leave_request"("employeeId", "dateFrom", "dateTo");

-- CreateIndex
CREATE INDEX "leave_request_status_idx" ON "leave_request"("status");

-- CreateIndex
CREATE INDEX "audit_log_domain_createdAt_idx" ON "audit_log"("domain", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_entityType_entityId_idx" ON "audit_log"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_log_actorId_idx" ON "audit_log"("actorId");

-- ───────────────────────────────────────────────────────────────
-- FOREIGN KEYS
--
-- Política general: ON DELETE RESTRICT. En este proyecto NO existe el hard
-- delete (todo es `deletedAt`), así que RESTRICT funciona como alambre de
-- púa: un DELETE físico accidental falla ruidosamente en vez de propagarse
-- en silencio. Las únicas excepciones son SET NULL sobre punteros a `user`
-- (Better Auth administra su propia tabla y sí puede borrar cuentas de
-- verdad) — y ahí el registro del dominio tiene que sobrevivir al usuario.
-- ───────────────────────────────────────────────────────────────

-- AddForeignKey
ALTER TABLE "category_day" ADD CONSTRAINT "category_day_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "employee_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- [EDIT] SET NULL → RESTRICT: borrar una categoría que todavía tiene
--   empleados no debe vaciarles el campo en silencio (perderían su
--   plantilla de horario sin rastro). Para dar de baja una categoría:
--   soft delete + reasignar.
ALTER TABLE "employee" ADD CONSTRAINT "employee_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "employee_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- SET NULL (se mantiene): si Better Auth borra la cuenta, el empleado
-- sobrevive sin login. El empleado NO es la cuenta.
ALTER TABLE "employee" ADD CONSTRAINT "employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_schedule" ADD CONSTRAINT "work_schedule_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_assignment" ADD CONSTRAINT "event_assignment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_assignment" ADD CONSTRAINT "event_assignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- [EDIT] SET NULL → RESTRICT: el vínculo fichada↔turno es la evidencia que
--   usa la liquidación. Cancelar una asignación NO es borrarla (es
--   status=CANCELLED / deletedAt), así que este ON DELETE no se dispara en
--   operación normal; si alguna vez se disparara, perder el vínculo en
--   silencio corrompería el cálculo de horas del evento.
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "event_assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- SET NULL (se mantiene): la fichada es un hecho inmutable y sobrevive al
-- supervisor que la editó. Se pierde el "quién", nunca el "qué".
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- SET NULL (se mantiene, y es obligatorio): un log de auditoría NUNCA muere
-- con el usuario. Si se borra la cuenta, el log queda con actorId NULL.
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
