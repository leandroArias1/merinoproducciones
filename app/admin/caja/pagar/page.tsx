import Link from 'next/link'
import { prisma } from '@/lib/db'
import { listPayables } from '@/lib/finance/queries'
import { totalPayable } from '@/lib/finance/profit'
import { listProvidersWithStats } from '@/lib/finance/party'
import { formatPesos } from '@/lib/payroll/format'
import { FinanceActionButton } from '@/components/finance/finance-action-button'
import { PartyForm } from '@/components/finance/party-form'
import { PartyList } from '@/components/finance/party-list'

const CAT_LABELS: Record<string, string> = { TRANSPORT: 'Transporte', EQUIPMENT: 'Equipos', VENUE: 'Lugar', SUPPLIES: 'Insumos', OTHER: 'Otro' }
const fmtDate = (d: Date) => d.toISOString().slice(0, 10)

export default async function PagarPage() {
  const [payables, payable, providers] = await Promise.all([
    listPayables(prisma),
    totalPayable(prisma),
    listProvidersWithStats(prisma),
  ])

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Proveedores y por pagar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <Link href="/admin/caja" className="hover:text-primary">← Caja</Link> · Total por pagar: <span className="font-medium text-foreground">{formatPesos(payable)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{providers.length} proveedor(es)</span>
          <PartyForm kind="PROVIDER" />
        </div>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Proveedores</h2>
        <PartyList rows={providers} kind="PROVIDER" />
      </section>

      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Gastos por pagar</h2>
      {payables.length === 0 ? (
        <div className="grid place-items-center rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm font-medium">No hay cuentas por pagar</p>
          <p className="mt-1 text-xs text-muted-foreground">Cargá un gasto sin tildar "pagado al toque" desde la pantalla de Caja.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Gasto</th>
                <th className="px-4 py-2.5 font-medium">Proveedor</th>
                <th className="px-4 py-2.5 font-medium">Evento</th>
                <th className="px-4 py-2.5 text-right font-medium">Monto</th>
                <th className="px-4 py-2.5 font-medium">Fecha</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {payables.map((p) => (
                <tr key={p.id} className="hover:bg-secondary/50">
                  <td className="px-4 py-2.5">
                    {p.description}
                    <span className="ml-2 text-xs text-muted-foreground">{CAT_LABELS[p.category] ?? p.category}</span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{p.providerName ?? '—'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{p.eventName ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{formatPesos(p.amountCents)}</td>
                  <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{fmtDate(p.incurredOn)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="inline-flex items-center gap-1.5">
                      <FinanceActionButton kind="pay" id={p.id} label="Pagar" confirm={`¿Pagar ${formatPesos(p.amountCents)}? Sale de caja ahora.`} />
                      <FinanceActionButton kind="delete-expense" id={p.id} label="Anular" variant="ghost" confirm="¿Anular este gasto?" />
                    </span>
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
