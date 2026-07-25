import Link from 'next/link'
import { Search } from 'lucide-react'
import type { PartyWithStats } from '@/lib/finance/party'
import { formatPesos } from '@/components/format'
import { cn } from '@/lib/utils'
import { FilterForm } from '@/components/shell/filter-form'
import { Button } from '@/components/ui/button'
import { PartyForm } from './party-form'
import { PartyRowActions } from './party-row-actions'

/**
 * La agenda de clientes o proveedores, como pantalla propia.
 *
 * REGLA: la agenda muestra a TODOS, siempre — también a los que todavía no
 * tienen ningún evento o gasto. Que un cliente recién creado no apareciera fue
 * el bug original que disparó todo este rediseño; acá queda convertido en
 * regla, con guiones honestos en lugar de filas ausentes.
 *
 * El filtrado se hace en memoria sobre las filas ya traídas: son decenas de
 * registros, no miles, y así no hay que tocar el dominio (`src/lib`) para
 * sumar un buscador.
 */

export type PartyFiltro = 'todos' | 'deuda' | 'aldia'

export interface PartyDirectoryProps {
  rows: PartyWithStats[]
  kind: 'CLIENT' | 'PROVIDER'
  q: string
  filtro: PartyFiltro
}

const COPY = {
  CLIENT: {
    titulo: 'Clientes',
    bajada: 'Quiénes te contratan y qué te deben.',
    unidad: 'cliente',
    colVinculos: 'Eventos',
    colDeuda: 'Te debe',
    totalDeuda: 'Te deben',
    conDeuda: 'Con deuda',
    chipDeuda: 'Con deuda',
    vacio: 'Todavía no cargaste clientes.',
    vacioAyuda: 'Cargá el primero y después asignalo a un evento desde la ficha del evento.',
  },
  PROVIDER: {
    titulo: 'Proveedores',
    bajada: 'A quiénes les comprás y qué les debés.',
    unidad: 'proveedor',
    colVinculos: 'Gastos',
    colDeuda: 'Le debés',
    totalDeuda: 'Les debés',
    conDeuda: 'Con deuda',
    chipDeuda: 'Con deuda',
    vacio: 'Todavía no cargaste proveedores.',
    vacioAyuda: 'Cargá el primero y después imputale gastos desde la pantalla de Caja.',
  },
} as const

/** Estado por FORMA además de color: se lee sin depender de distinguir tonos. */
function EstadoPill({ debe }: { debe: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
        debe
          ? 'border-[color-mix(in_oklch,var(--warning)_34%,transparent)] bg-warning-tint text-[var(--warning)]'
          : 'border-[color-mix(in_oklch,var(--success)_30%,transparent)] bg-success-tint text-[var(--success)]',
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      {debe ? 'debe' : 'al día'}
    </span>
  )
}

export function PartyDirectory({ rows, kind, q, filtro }: PartyDirectoryProps) {
  const t = COPY[kind]
  const base = kind === 'CLIENT' ? '/admin/clientes' : '/admin/proveedores'

  // Totales SIEMPRE sobre el universo completo: el resumen no depende del filtro.
  const totalDeuda = rows.reduce((acc, r) => acc + r.pendingCents, 0n)
  const conDeuda = rows.filter((r) => r.pendingCents > 0n).length

  const term = q.trim().toLowerCase()
  const visibles = rows.filter((r) => {
    if (term && !r.name.toLowerCase().includes(term) && !(r.notes ?? '').toLowerCase().includes(term)) return false
    if (filtro === 'deuda') return r.pendingCents > 0n
    if (filtro === 'aldia') return r.pendingCents === 0n
    return true
  })

  const chips: { key: PartyFiltro; label: string }[] = [
    { key: 'todos', label: 'Todos' },
    { key: 'deuda', label: t.chipDeuda },
    { key: 'aldia', label: 'Al día' },
  ]
  const hrefChip = (k: PartyFiltro) => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (k !== 'todos') p.set('estado', k)
    const qs = p.toString()
    return qs ? `${base}?${qs}` : base
  }

  return (
    <div>
      <header className="mb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{t.titulo}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t.bajada}</p>
          </div>
          <PartyForm kind={kind} />
        </div>

        {/* El resumen antes que el detalle: la respuesta arriba, la tabla abajo. */}
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3 border-b pb-4">
          <Resumen k={`${t.unidad}s`} v={String(rows.length)} />
          <Resumen k={t.totalDeuda} v={formatPesos(totalDeuda)} tone={totalDeuda > 0n ? 'warning' : undefined} />
          <Resumen k={t.conDeuda} v={String(conDeuda)} />
        </div>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FilterForm className="flex min-w-56 flex-1 items-center gap-2">
          <label className="flex h-9 flex-1 items-center gap-2 rounded-md border bg-paper px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              name="q"
              defaultValue={q}
              placeholder={`Buscar ${t.unidad} por nombre o nota…`}
              className="w-full bg-transparent text-sm outline-none"
              aria-label={`Buscar ${t.unidad}`}
            />
          </label>
          {filtro !== 'todos' && <input type="hidden" name="estado" value={filtro} />}
          <Button type="submit" variant="secondary" size="sm">
            Buscar
          </Button>
        </FilterForm>

        <div className="flex overflow-hidden rounded-md border">
          {chips.map((c, i) => (
            <Link
              key={c.key}
              href={hrefChip(c.key)}
              prefetch={false}
              aria-current={filtro === c.key ? 'true' : undefined}
              className={cn(
                'px-3 py-1.5 text-sm transition-colors',
                i > 0 && 'border-l',
                filtro === c.key
                  ? 'bg-foreground font-semibold text-background'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              {c.label}
            </Link>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <Vacio titulo={t.vacio} ayuda={t.vacioAyuda} />
      ) : visibles.length === 0 ? (
        <Vacio
          titulo="Ningún resultado"
          ayuda={`No hay ${t.unidad}s que coincidan con la búsqueda o el filtro.`}
          accion={
            <Link href={base} prefetch={false} className="text-sm font-medium text-primary hover:underline">
              Ver todos
            </Link>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-surface">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {kind === 'CLIENT' ? 'Cliente' : 'Proveedor'}
                </th>
                <th className="px-4 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Notas
                </th>
                <th className="px-4 py-2.5 text-right text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t.colVinculos}
                </th>
                <th className="px-4 py-2.5 text-right text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t.colDeuda}
                </th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {visibles.map((r) => {
                const debe = r.pendingCents > 0n
                return (
                  <tr key={r.id} className="border-b border-[var(--border-soft)] last:border-0 hover:bg-paper">
                    <td className="px-4 py-2.5 font-medium">{r.name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.notes || '—'}</td>
                    <td className="num px-4 py-2.5 text-right text-muted-foreground">{r.count}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2.5">
                        <EstadoPill debe={debe} />
                        <span className={cn('num font-semibold', debe ? 'text-[var(--warning)]' : 'text-muted-foreground')}>
                          {formatPesos(r.pendingCents)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <PartyRowActions
                        id={r.id}
                        name={r.name}
                        notes={r.notes}
                        kindLabel={kind === 'CLIENT' ? 'cliente' : 'proveedor'}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Resumen({ k, v, tone }: { k: string; v: string; tone?: 'warning' }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{k}</span>
      <span className={cn('num text-xl font-semibold tracking-tight', tone === 'warning' && 'text-[var(--warning)]')}>
        {v}
      </span>
    </div>
  )
}

function Vacio({ titulo, ayuda, accion }: { titulo: string; ayuda: string; accion?: React.ReactNode }) {
  return (
    <div className="grid place-items-center rounded-lg border border-dashed px-6 py-14 text-center">
      <p className="text-sm font-medium">{titulo}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{ayuda}</p>
      {accion && <div className="mt-3">{accion}</div>}
    </div>
  )
}
