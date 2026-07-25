import { formatPesos } from '@/lib/payroll/format'
import type { PartyWithStats } from '@/lib/finance/party'
import { PartyRowActions } from './party-row-actions'

/** Lista gestionable de clientes o proveedores (nombre, notas, vínculos, pendiente, editar/borrar).
 *  Server Component: formatPesos y la comparación BigInt corren acá; al cliente solo cruzan strings. */
export function PartyList({ rows, kind }: { rows: PartyWithStats[]; kind: 'CLIENT' | 'PROVIDER' }) {
  const isClient = kind === 'CLIENT'
  const kindLabel = isClient ? 'cliente' : 'proveedor'

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
        Todavía no cargaste {kindLabel}s. Creá el primero con «+ Nuevo {kindLabel}».
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium">{isClient ? 'Cliente' : 'Proveedor'}</th>
            <th className="px-4 py-2.5 font-medium">Notas</th>
            <th className="px-4 py-2.5 text-right font-medium">{isClient ? 'Eventos' : 'Gastos'}</th>
            <th className="px-4 py-2.5 text-right font-medium">{isClient ? 'Por cobrar' : 'Por pagar'}</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.id} className="align-middle hover:bg-secondary/50">
              <td className="px-4 py-2.5 font-medium">{r.name}</td>
              <td className="px-4 py-2.5 text-muted-foreground">{r.notes || '—'}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{r.count}</td>
              <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${r.pendingCents > 0n ? 'text-[var(--warning)]' : 'text-[var(--success)]'}`}>
                {formatPesos(r.pendingCents)}
              </td>
              <td className="px-4 py-2.5 text-right">
                <PartyRowActions id={r.id} name={r.name} notes={r.notes} kindLabel={kindLabel} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
