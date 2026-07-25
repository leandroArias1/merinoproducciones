import Link from 'next/link'
import { prisma } from '@/lib/db'
import { listEmployeesForRaise } from '@/lib/payroll/queries'
import { formatPesos } from '@/lib/payroll/format'
import { BulkRaiseForm } from '@/components/payroll/bulk-raise-form'

export default async function AumentosPage() {
  const emps = await listEmployeesForRaise(prisma)
  const vm = emps.map((e) => ({
    id: e.id,
    name: e.name,
    categoryName: e.categoryName,
    vigente: e.vigenteCents != null ? formatPesos(e.vigenteCents) : '—',
  }))

  return (
    <div>
      <header className="mb-6 border-b pb-4">
        <h1 className="text-xl font-semibold tracking-tight">Aumentos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <Link href="/admin/liquidaciones" className="hover:text-primary">
            ← Liquidaciones
          </Link>{' '}
          · Seleccioná empleados y aplicá el nuevo sueldo mensual. Cada uno versiona su historial (auditado).
        </p>
      </header>
      <BulkRaiseForm employees={vm} />
    </div>
  )
}
