import { Prisma } from '@/generated/prisma/client'
import type { Tx } from '@/lib/attendance/persist'

/** Escribe un AuditLog domain PAYROLL. Siempre dentro de una transacción. */
export async function writePayrollAudit(
  tx: Tx,
  args: { action: string; entityType: string; entityId: string; before: unknown; after: unknown; actorId: string | null },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      domain: 'PAYROLL',
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      before: args.before === null ? Prisma.DbNull : (args.before as Prisma.InputJsonValue),
      after: args.after === null ? Prisma.DbNull : (args.after as Prisma.InputJsonValue),
      actorId: args.actorId,
    },
  })
}
