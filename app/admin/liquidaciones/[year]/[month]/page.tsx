import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, FileText } from 'lucide-react'
import { prisma } from '@/lib/db'
import { getPeriodDetail, type ItemStatus } from '@/lib/payroll/queries'
import { formatPesos, monthLabel } from '@/lib/payroll/format'
import { centavosPelados } from '@/components/format'
import { CopyButton } from '@/components/ui/copy-button'
import { StatusBadge } from '@/components/events/status-badge'
import { PeriodActions } from '@/components/payroll/period-actions'
import { CloseItemButton } from '@/components/payroll/close-item-button'

/** Link "Resolver": al DÍA concreto que bloquea; si no se sabe, a la lista. */
function resolverHref(dayKey: string | null): string {
  return dayKey ? `/admin/asistencia?vista=dia&fecha=${dayKey}` : '/admin/asistencia?vista=revisar'
}

const ITEM_STATUS: Record<ItemStatus, { label: string; tone: 'success' | 'danger' | 'muted' | 'accent' }> = {
  READY: { label: 'Listo', tone: 'muted' },
  BLOCKED: { label: 'Bloqueado', tone: 'danger' },
  CLOSED: { label: 'Cerrado', tone: 'accent' },
  PAID: { label: 'Pagado', tone: 'success' },
  DRAFT: { label: 'Borrador', tone: 'muted' },
}
const PERIOD_LABEL: Record<string, { label: string; tone: 'success' | 'danger' | 'muted' | 'accent' }> = {
  OPEN: { label: 'Abierto', tone: 'muted' },
  CLOSED: { label: 'Cerrado', tone: 'accent' },
  PAID: { label: 'Pagado', tone: 'success' },
  NONE: { label: 'Sin generar', tone: 'muted' },
}

export default async function PeriodoPage({ params }: { params: Promise<{ year: string; month: string }> }) {
  const { year, month } = await params
  const y = Number(year)
  const m = Number(month)
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) notFound()

  const detail = await getPeriodDetail(prisma, y, m)
  const isOpen = detail.status === 'OPEN' || detail.status === 'NONE'
  const s = detail.summary
  // Con el mes ya cerrado, todo lo que no tenga recibo sigue pendiente: los que
  // siguen bloqueados y los que se destrabaron y todavía hay que cerrar.
  const pendientes = detail.status === 'CLOSED' ? s.blocked + s.ready : 0

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold capitalize tracking-tight">{monthLabel(y, m)}</h1>
            <StatusBadge label={PERIOD_LABEL[detail.status].label} tone={PERIOD_LABEL[detail.status].tone} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            <Link href="/admin/liquidaciones" className="hover:text-primary">
              ← Sueldos
            </Link>
          </p>
        </div>
        <PeriodActions year={y} month={m} status={detail.status} canClose={s.ready > 0} pendientes={pendientes} />
      </header>

      {/* Mes cerrado con gente sin recibo: hay que terminarlos antes de pagar. */}
      {pendientes > 0 && (
        <div className="mb-4 rounded-lg border bg-secondary/40 px-4 py-3 text-sm">
          <span className="inline-flex items-center gap-1.5 text-[var(--warning)] [&_svg]:size-4">
            <AlertTriangle />
            <span className="font-medium">
              {pendientes} empleado(s) sin recibo en este mes.
            </span>
          </span>
          <span className="ml-1 text-muted-foreground">
            {s.ready > 0
              ? 'Los que ya tienen sus días resueltos se cierran de a uno con “Generar recibo”, sin reabrir el mes.'
              : 'Resolvé sus días sin verificar y después generá su recibo.'}{' '}
            Hasta entonces el período no se puede marcar como pagado.
          </span>
        </div>
      )}

      {/* Checklist de cierre (solo mientras está abierto) */}
      {isOpen && s.total > 0 && (
        <div className="mb-4 rounded-lg border bg-secondary/40 px-4 py-3 text-sm">
          <span className="font-medium">
            {s.ready} de {s.total} listos para liquidar
          </span>
          {s.blocked > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 text-[var(--warning)] [&_svg]:size-3.5">
              · <AlertTriangle /> {s.blocked} bloqueado(s) por días sin resolver ·{' '}
              <Link href="/admin/asistencia?vista=revisar" className="underline">
                Ver días a revisar
              </Link>
            </span>
          )}
        </div>
      )}

      {detail.rows.length === 0 ? (
        <div className="grid place-items-center rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          No hay empleados para liquidar en este mes.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Empleado</th>
                <th className="px-4 py-2.5 text-right font-medium">Sueldo base</th>
                <th className="px-4 py-2.5 text-right font-medium">Faltas</th>
                <th className="px-4 py-2.5 text-right font-medium">Descuento</th>
                <th className="px-4 py-2.5 text-right font-medium">Neto</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {detail.rows.map((r) => (
                <tr key={r.employeeId} className="hover:bg-secondary/50">
                  {/* El alias va bajo el nombre y no como columna: es texto de
                      ancho variable y una octava columna aprieta los números.
                      Acá se lee "esta persona cobra $X y este es su alias" sin
                      abrir la ficha de cada uno para pagar. */}
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{r.employeeName}</div>
                    {r.alias ? (
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="select-all font-mono text-xs text-muted-foreground">{r.alias}</span>
                        <CopyButton value={r.alias} label={`el alias de ${r.employeeName}`} />
                      </div>
                    ) : (
                      <div className="mt-0.5 text-xs text-muted-foreground/70">sin alias</div>
                    )}
                  </td>
                  {r.status === 'BLOCKED' ? (
                    <td className="px-4 py-2.5 text-right text-xs text-muted-foreground" colSpan={4}>
                      pendiente de resolver
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatPesos(r.baseCents)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{r.absentDays}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                        {r.deductionCents > 0n ? `−${formatPesos(r.deductionCents)}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="font-semibold tabular-nums">{formatPesos(r.netCents)}</span>
                          {r.netCents > 0n && (
                            <CopyButton value={centavosPelados(r.netCents)} label={`el monto de ${r.employeeName}`} />
                          )}
                        </div>
                      </td>
                    </>
                  )}
                  <td className="px-4 py-2.5">
                    <StatusBadge label={ITEM_STATUS[r.status].label} tone={ITEM_STATUS[r.status].tone} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {r.itemId && (r.status === 'CLOSED' || r.status === 'PAID') ? (
                      <Link href={`/admin/liquidaciones/recibo/${r.itemId}`} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs hover:bg-secondary [&_svg]:size-3.5">
                        <FileText /> Recibo
                      </Link>
                    ) : r.status === 'BLOCKED' ? (
                      <Link href={resolverHref(r.blockingDayKey)} className="text-xs text-muted-foreground underline">
                        Resolver
                      </Link>
                    ) : r.status === 'READY' && detail.status === 'CLOSED' ? (
                      // Quedó destrabado DESPUÉS del cierre: se cierra solo él,
                      // sin reabrir el mes ni tocar los recibos ya emitidos.
                      <CloseItemButton year={y} month={m} employeeId={r.employeeId} employeeName={r.employeeName} netLabel={formatPesos(r.netCents)} />
                    ) : null}
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
