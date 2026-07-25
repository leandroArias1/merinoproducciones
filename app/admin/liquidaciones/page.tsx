import Link from 'next/link'
import { DateTime } from 'luxon'
import { TrendingUp, ArrowRight } from 'lucide-react'
import { prisma } from '@/lib/db'
import { listPeriods, type PeriodStatus } from '@/lib/payroll/queries'
import { monthLabel } from '@/lib/payroll/format'
import { BA_ZONE } from '@/lib/attendance/timezone'
import { StatusBadge } from '@/components/events/status-badge'
import { Button } from '@/components/ui/button'

const STATUS: Record<PeriodStatus, { label: string; tone: 'muted' | 'accent' | 'success' }> = {
  OPEN: { label: 'Abierto', tone: 'muted' },
  CLOSED: { label: 'Cerrado', tone: 'accent' },
  PAID: { label: 'Pagado', tone: 'success' },
}

export default async function LiquidacionesPage() {
  const periods = await listPeriods(prisma)
  const now = DateTime.now().setZone(BA_ZONE)
  const curLabel = monthLabel(now.year, now.month)

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Liquidaciones</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sueldos mensuales y recibos.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/liquidaciones/aumentos">
            <Button variant="secondary" size="sm">
              <TrendingUp /> Aumentos
            </Button>
          </Link>
          <Link href={`/admin/liquidaciones/${now.year}/${now.month}`}>
            <Button size="sm">
              Ir al mes en curso ({curLabel}) <ArrowRight />
            </Button>
          </Link>
        </div>
      </header>

      {periods.length === 0 ? (
        <div className="grid place-items-center rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm font-medium">Todavía no hay períodos</p>
          <p className="mt-1 text-xs text-muted-foreground">Entrá al mes en curso para armar y cerrar la primera liquidación.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Período</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {periods.map((p) => (
                <tr key={`${p.year}-${p.month}`} className="hover:bg-secondary/50">
                  <td className="px-4 py-2.5 font-medium capitalize">{monthLabel(p.year, p.month)}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge label={STATUS[p.status].label} tone={STATUS[p.status].tone} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link href={`/admin/liquidaciones/${p.year}/${p.month}`} className="rounded-md border px-2.5 py-1 text-xs hover:bg-secondary">
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
