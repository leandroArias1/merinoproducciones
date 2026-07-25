import type { EventFinance } from '@/lib/finance/profit'
import { formatPesos } from '@/components/format'
import { cn } from '@/lib/utils'
import { SetPriceForm } from '@/components/finance/set-price-form'
import { PaymentForm } from '@/components/finance/payment-form'

/**
 * Cliente, precio, cobranza y rentabilidad del evento, en la ficha del evento
 * —que es donde el dueño los piensa— y no repartidos por las pantallas de caja.
 *
 * Los números NO se recalculan acá: llegan de `buildEventProfit`, que usa la
 * función pura `computeEventProfit` ya testeada (ingreso PACTADO menos costo
 * COMPROMETIDO = PENDING + PAID). Este componente sólo muestra.
 *
 * Es Server Component a propósito: así los BigInt se formatean acá y nunca
 * cruzan al cliente (no serializan). Los formularios que sí son client
 * reciben números en pesos.
 */

const pesos = (cents: bigint) => Number(cents) / 100 // sólo para prellenar el input

export function EventMoneyPanel({
  fin,
  clients,
  clientName,
}: {
  fin: EventFinance
  clients: { id: string; name: string }[]
  clientName: string | null
}) {
  const { profit } = fin
  const cobrado = fin.paidCents
  const pendiente = fin.pendingCents

  return (
    <section className="rounded-lg border bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Cobranza y rentabilidad</h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {clientName ? (
              <>
                Cliente: <span className="font-medium text-foreground">{clientName}</span>
              </>
            ) : (
              'Sin cliente asignado.'
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {profit.hasPrice && pendiente > 0n && <PaymentForm eventId={fin.eventId} />}
          <SetPriceForm
            eventId={fin.eventId}
            clients={clients}
            currentPesos={fin.agreedCents != null ? pesos(fin.agreedCents) : undefined}
            currentClientId={fin.clientId}
            cta={profit.hasPrice ? 'Editar precio y cliente' : 'Cargar precio y cliente'}
          />
        </div>
      </header>

      {!profit.hasPrice ? (
        // Sin precio NO se inventa una pérdida: los gastos ya imputados se
        // muestran como lo que son, un costo a la espera del precio.
        <div className="px-4 py-5">
          <p className="text-sm font-medium">Precio a definir</p>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            {fin.costCents > 0n ? (
              <>
                Este evento ya tiene <span className="num font-medium text-foreground">{formatPesos(fin.costCents)}</span>{' '}
                de gastos imputados. Cargá el precio pactado para ver la ganancia.
              </>
            ) : (
              'Cargá el precio pactado con el cliente para seguir la cobranza y la rentabilidad.'
            )}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 divide-x divide-y border-b sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-5">
            <Cifra k="Pactado" v={formatPesos(fin.agreedCents!)} />
            <Cifra k="Cobrado" v={formatPesos(cobrado)} tone={cobrado > 0n ? 'ok' : undefined} />
            <Cifra k="Pendiente" v={formatPesos(pendiente)} tone={pendiente > 0n ? 'debe' : 'ok'} />
            <Cifra k="Costos imputados" v={formatPesos(fin.costCents)} />
            <Cifra
              k="Ganancia"
              v={formatPesos(profit.profitCents)}
              sub={profit.marginPct != null ? `${profit.marginPct}% de margen` : undefined}
              tone={profit.profitCents >= 0n ? 'ok' : 'debe'}
              strong
            />
          </div>
          <p className="px-4 py-2.5 text-xs text-muted-foreground">
            La ganancia se calcula sobre lo <b>pactado</b>, no sobre lo cobrado, y el costo cuenta los gastos
            imputados aunque todavía no estén pagados. Los sueldos no se imputan al evento.
          </p>
        </>
      )}
    </section>
  )
}

function Cifra({
  k,
  v,
  sub,
  tone,
  strong,
}: {
  k: string
  v: string
  sub?: string
  tone?: 'ok' | 'debe'
  strong?: boolean
}) {
  return (
    <div className="px-4 py-3">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{k}</p>
      <p
        className={cn(
          'num mt-0.5 font-semibold tracking-tight',
          strong ? 'text-xl' : 'text-base',
          tone === 'ok' && 'text-[var(--success)]',
          tone === 'debe' && 'text-[var(--warning)]',
        )}
      >
        {v}
      </p>
      {sub && <p className="num mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}
