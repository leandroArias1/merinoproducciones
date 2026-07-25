import Link from 'next/link'
import { ReceiptText, Settings } from 'lucide-react'
import { prisma } from '@/lib/db'
import { cashBalance } from '@/lib/finance/profit'
import { listMovements } from '@/lib/finance/queries'
import { listParties } from '@/lib/finance/party'
import { formatPesos, fechaAR } from '@/components/format'
import { NewExpenseForm } from '@/components/finance/new-expense-form'
import { FinanceActionButton } from '@/components/finance/finance-action-button'
import { FilterForm } from '@/components/shell/filter-form'
import { Button } from '@/components/ui/button'

const CAT_LABELS: Record<string, string> = {
  CLIENT_PAYMENT: 'Cobro cliente',
  EXPENSE_PAYMENT: 'Pago gasto',
  SALARY: 'Sueldos',
  OTHER: 'Otro',
}

export default async function CajaPage({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string; tipo?: string }> }) {
  const sp = await searchParams
  const direction = sp.tipo === 'INCOME' || sp.tipo === 'EXPENSE' ? sp.tipo : undefined
  const [saldo, movements, providers, events] = await Promise.all([
    cashBalance(prisma),
    listMovements(prisma, { fromKey: sp.desde, toKey: sp.hasta, direction }),
    listParties(prisma, 'PROVIDER'),
    prisma.event.findMany({ where: { deletedAt: null }, orderBy: { startAt: 'desc' }, select: { id: true, name: true } }),
  ])

  // Entró/salió se derivan de lo que se está listando, así acompañan al filtro.
  const entro = movements.reduce((a, m) => (m.direction === 'INCOME' ? a + m.amountCents : a), 0n)
  const salio = movements.reduce((a, m) => (m.direction === 'EXPENSE' ? a + m.amountCents : a), 0n)

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Caja</h1>
          <p className="mt-1 text-sm text-muted-foreground">Lo que entra, lo que sale y cuánto hay.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/caja/pagar"><Button variant="secondary" size="sm"><ReceiptText /> Por pagar</Button></Link>
          <Link href="/admin/caja/config"><Button variant="secondary" size="sm"><Settings /> Config</Button></Link>
        </div>
      </header>

      {/* Entra / sale / saldo: las tres cifras que contesta esta pantalla.
          El saldo manda por tamaño; entró y salió lo explican. */}
      <div className="mb-6 flex flex-wrap items-end gap-x-10 gap-y-4 rounded-lg border bg-paper px-5 py-4">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Saldo actual</p>
          <p className={`num mt-0.5 text-3xl font-bold tracking-tight ${saldo < 0n ? 'text-destructive' : ''}`}>
            {formatPesos(saldo)}
          </p>
        </div>
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Entró</p>
          <p className="num mt-0.5 text-lg font-semibold text-[var(--success)]">{formatPesos(entro)}</p>
        </div>
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Salió</p>
          <p className="num mt-0.5 text-lg font-semibold text-destructive">{formatPesos(salio)}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          {sp.desde || sp.hasta ? 'Entró y salió, en el período filtrado.' : 'Entró y salió, sobre todo lo listado.'}
        </p>
      </div>

      <div className="mb-6">
        <NewExpenseForm providers={providers} events={events} />
      </div>

      <FilterForm className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Desde</label>
          <input type="date" name="desde" defaultValue={sp.desde} className="h-9 rounded-md border bg-background px-3 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Hasta</label>
          <input type="date" name="hasta" defaultValue={sp.hasta} className="h-9 rounded-md border bg-background px-3 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Tipo</label>
          <select name="tipo" defaultValue={direction ?? ''} className="h-9 rounded-md border bg-background px-3 text-sm">
            <option value="">Todos</option>
            <option value="INCOME">Ingresos</option>
            <option value="EXPENSE">Egresos</option>
          </select>
        </div>
        <Button type="submit" variant="secondary" size="sm">Filtrar</Button>
      </FilterForm>

      {movements.length === 0 ? (
        <div className="grid place-items-center rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">Sin movimientos.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Fecha</th>
                <th className="px-4 py-2.5 font-medium">Concepto</th>
                <th className="px-4 py-2.5 font-medium">Tipo</th>
                <th className="px-4 py-2.5 text-right font-medium">Monto</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {movements.map((m) => (
                <tr key={m.id} className="hover:bg-secondary/50">
                  <td className="num px-4 py-2.5 text-muted-foreground">{fechaAR(m.occurredOn)}</td>
                  <td className="px-4 py-2.5">
                    {m.concept}
                    <span className="ml-2 text-xs text-muted-foreground">{CAT_LABELS[m.category] ?? m.category}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {m.direction === 'INCOME' ? (
                      <span className="text-xs font-medium text-[var(--success)]">Ingreso</span>
                    ) : (
                      <span className="text-xs font-medium text-destructive">Egreso</span>
                    )}
                  </td>
                  <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${m.direction === 'EXPENSE' ? 'text-destructive' : ''}`}>
                    {m.direction === 'EXPENSE' ? '−' : '+'}
                    {formatPesos(m.amountCents)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <FinanceActionButton
                      kind="delete-movement"
                      id={m.id}
                      label="Anular"
                      variant="ghost"
                      confirmLabel="Sí, anular"
                      title="¿Anular este movimiento?"
                      // Concreto, no genérico: el monto exacto, hacia dónde se
                      // mueve el saldo y qué vuelve a figurar como impago.
                      description={
                        <>
                          Es plata: el saldo {m.direction === 'INCOME' ? 'baja' : 'sube'}{' '}
                          <b className="num text-foreground">{formatPesos(m.amountCents)}</b>
                          {m.direction === 'INCOME' ? (
                            <> y <b className="text-foreground">{m.concept}</b> vuelve a figurar como impago.</>
                          ) : m.category === 'EXPENSE_PAYMENT' ? (
                            <> y el gasto de <b className="text-foreground">{m.concept}</b> vuelve a figurar como impago.</>
                          ) : (
                            <>.</>
                          )}
                        </>
                      }
                    />
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
