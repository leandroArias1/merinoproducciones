import Link from 'next/link'
import { prisma } from '@/lib/db'
import { listEventProfits } from '@/lib/finance/profit'
import { totalReceivable } from '@/lib/finance/profit'
import { listClientsWithStats } from '@/lib/finance/party'
import { formatPesos } from '@/lib/payroll/format'
import { PaymentForm } from '@/components/finance/payment-form'
import { SetPriceForm } from '@/components/finance/set-price-form'
import { PartyForm } from '@/components/finance/party-form'
import { PartyList } from '@/components/finance/party-list'

const pesos = (cents: bigint) => Number(cents) / 100 // solo para prellenar el form (input en pesos)

export default async function CobrarPage() {
  const [events, clients, receivable] = await Promise.all([
    listEventProfits(prisma),
    listClientsWithStats(prisma),
    totalReceivable(prisma),
  ])
  const clientOpts = clients.map((c) => ({ id: c.id, name: c.name }))

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Clientes y por cobrar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <Link href="/admin/caja" className="hover:text-primary">← Caja</Link> · Total por cobrar: <span className="font-medium text-foreground">{formatPesos(receivable)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{clients.length} cliente(s)</span>
          <PartyForm kind="CLIENT" />
        </div>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Clientes</h2>
        <PartyList rows={clients} kind="CLIENT" />
      </section>

      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Eventos por cobrar</h2>
      {events.length === 0 ? (
        <div className="grid place-items-center rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">No hay eventos.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Evento</th>
                <th className="px-4 py-2.5 text-right font-medium">Pactado</th>
                <th className="px-4 py-2.5 text-right font-medium">Cobrado</th>
                <th className="px-4 py-2.5 text-right font-medium">Pendiente</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {events.map((e) => (
                <tr key={e.eventId} className="align-middle hover:bg-secondary/50">
                  <td className="px-4 py-2.5 font-medium">{e.name}</td>
                  {e.profit.hasPrice ? (
                    <>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatPesos(e.agreedCents!)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{formatPesos(e.paidCents)}</td>
                      <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${e.pendingCents > 0n ? 'text-[var(--warning)]' : 'text-[var(--success)]'}`}>{formatPesos(e.pendingCents)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="inline-flex items-center gap-2">
                          {e.pendingCents > 0n && <PaymentForm eventId={e.eventId} />}
                          <SetPriceForm eventId={e.eventId} clients={clientOpts} currentPesos={pesos(e.agreedCents!)} currentClientId={e.clientId} cta="Editar precio" />
                        </span>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2.5 text-right text-xs text-muted-foreground" colSpan={3}>precio a definir</td>
                      <td className="px-4 py-2.5 text-right">
                        <SetPriceForm eventId={e.eventId} clients={clientOpts} currentClientId={e.clientId} />
                      </td>
                    </>
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
