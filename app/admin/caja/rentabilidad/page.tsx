import Link from 'next/link'
import { prisma } from '@/lib/db'
import { listEventProfits } from '@/lib/finance/profit'
import { formatPesos } from '@/lib/payroll/format'
import { Button } from '@/components/ui/button'

export default async function RentabilidadPage() {
  const events = await listEventProfits(prisma)
  const conActividad = events.filter((e) => e.profit.hasPrice || e.costCents > 0n)

  return (
    <div>
      <header className="mb-6 border-b pb-4">
        <h1 className="text-xl font-semibold tracking-tight">Rentabilidad por evento</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <Link href="/admin/caja" className="hover:text-primary">← Caja</Link> · Ingreso PACTADO − gastos imputados. Los sueldos no se imputan.
        </p>
      </header>

      {conActividad.length === 0 ? (
        <div className="grid place-items-center rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          Todavía no hay eventos con precio o gastos.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[720px] text-sm">
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
              {conActividad.map((e) => (
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
                    <td className="px-4 py-2.5" colSpan={4}>
                      <div className="flex items-center justify-end gap-3">
                        <span className="text-xs text-muted-foreground">
                          Precio a definir{e.costCents > 0n ? ` · ${formatPesos(e.costCents)} en gastos` : ''}
                        </span>
                        <Link href="/admin/caja/cobrar">
                          <Button size="sm" variant="secondary">Cargar precio</Button>
                        </Link>
                      </div>
                    </td>
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
