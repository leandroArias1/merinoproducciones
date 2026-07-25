import Link from 'next/link'
import { DateTime } from 'luxon'
import { prisma } from '@/lib/db'
import { monthSummary } from '@/lib/finance/queries'
import { formatPesos, monthLabel } from '@/lib/payroll/format'
import { BA_ZONE } from '@/lib/attendance/timezone'

function Metric({ label, cents, tone }: { label: string; cents: bigint; tone?: 'in' | 'out' | 'neutral' }) {
  const color = tone === 'in' ? 'text-[var(--success)]' : tone === 'out' ? 'text-destructive' : cents < 0n ? 'text-destructive' : ''
  return (
    <div className="rounded-lg border px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${color}`}>{formatPesos(cents)}</p>
    </div>
  )
}

export default async function ReportesPage({ searchParams }: { searchParams: Promise<{ y?: string; m?: string }> }) {
  const sp = await searchParams
  const now = DateTime.now().setZone(BA_ZONE)
  const year = Number(sp.y) || now.year
  const month = Number(sp.m) || now.month
  const s = await monthSummary(prisma, year, month)

  const prev = DateTime.fromObject({ year, month }, { zone: BA_ZONE }).minus({ months: 1 })
  const next = DateTime.fromObject({ year, month }, { zone: BA_ZONE }).plus({ months: 1 })

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="text-xl font-semibold capitalize tracking-tight">Reportes · {monthLabel(year, month)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Caja, cuentas y rentabilidad del mes.</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/admin/reportes?y=${prev.year}&m=${prev.month}`} className="rounded-md border px-2.5 py-1 hover:bg-secondary">←</Link>
          <Link href={`/admin/reportes?y=${next.year}&m=${next.month}`} className="rounded-md border px-2.5 py-1 hover:bg-secondary">→</Link>
        </div>
      </header>

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Metric label="Entró (mes)" cents={s.inCents} tone="in" />
        <Metric label="Salió (mes)" cents={s.outCents} tone="out" />
        <Metric label="Resultado del mes" cents={s.resultCents} />
        <Metric label="Saldo actual de caja" cents={s.saldoCents} />
        <Metric label="Por cobrar (clientes)" cents={s.receivableCents} />
        <Metric label="Por pagar (proveedores)" cents={s.payableCents} />
      </div>

      <h2 className="mb-3 text-sm font-semibold">Rentabilidad por evento</h2>
      {s.eventProfits.length === 0 ? (
        <div className="grid place-items-center rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">Sin eventos con precio o gastos.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Evento</th>
                <th className="px-4 py-2.5 text-right font-medium">Ingreso</th>
                <th className="px-4 py-2.5 text-right font-medium">Costo</th>
                <th className="px-4 py-2.5 text-right font-medium">Ganancia</th>
                <th className="px-4 py-2.5 text-right font-medium">Margen</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {s.eventProfits.map((e) => (
                <tr key={e.eventId} className="hover:bg-secondary/50">
                  <td className="px-4 py-2.5 font-medium">{e.name}</td>
                  {e.profit.hasPrice ? (
                    <>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatPesos(e.profit.incomeCents)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{formatPesos(e.costCents)}</td>
                      <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${e.profit.profitCents < 0n ? 'text-destructive' : 'text-[var(--success)]'}`}>{formatPesos(e.profit.profitCents)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{e.profit.marginPct === null ? '—' : `${e.profit.marginPct}%`}</td>
                    </>
                  ) : (
                    <td className="px-4 py-2.5 text-right text-xs text-muted-foreground" colSpan={4}>precio a definir</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
