import Link from 'next/link'
import { prisma } from '@/lib/db'
import { getAbsentDeductionCents } from '@/lib/payroll/settings'
import { ConfigForm } from '@/components/finance/config-form'

export default async function ConfigPage() {
  const cents = await getAbsentDeductionCents(prisma)
  const pesos = cents != null ? Number(cents) / 100 : null
  return (
    <div>
      <header className="mb-6 border-b pb-4">
        <h1 className="text-xl font-semibold tracking-tight">Configuración</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <Link href="/admin/caja" className="hover:text-primary">← Caja</Link> · Parámetros de liquidación.
        </p>
      </header>
      <ConfigForm currentPesos={pesos} />
    </div>
  )
}
