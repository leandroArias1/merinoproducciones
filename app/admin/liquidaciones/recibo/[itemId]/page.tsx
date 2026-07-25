import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getReceipt } from '@/lib/payroll/queries'
import { formatPesos, monthLabel } from '@/lib/payroll/format'
import { PrintButton } from '@/components/payroll/print-button'

export default async function ReciboPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params
  const r = await getReceipt(prisma, itemId)
  if (!r) notFound()

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={`/admin/liquidaciones/${r.year}/${r.month}`} className="text-sm text-muted-foreground hover:text-primary">
          ← Volver al período
        </Link>
        <PrintButton />
      </div>

      <div className="rounded-lg border p-6">
        <header className="mb-5 border-b pb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recibo de sueldo</p>
          <h1 className="mt-1 text-lg font-semibold">{r.employeeName}</h1>
          <p className="text-sm text-muted-foreground">
            DNI {r.documentId} · <span className="capitalize">{monthLabel(r.year, r.month)}</span>
          </p>
        </header>

        <table className="w-full text-sm">
          <tbody className="divide-y">
            {r.lines.map((l, i) => (
              <tr key={i}>
                <td className="py-2.5 pr-4">{l.concept}</td>
                <td className={`py-2.5 text-right tabular-nums ${l.kind === 'DEDUCTION' ? 'text-destructive' : ''}`}>
                  {formatPesos(l.amountCents)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2">
              <td className="py-3 pr-4 text-base font-semibold">Neto a cobrar</td>
              <td className="py-3 text-right text-base font-bold tabular-nums">{formatPesos(r.netCents)}</td>
            </tr>
          </tfoot>
        </table>

        <p className="mt-5 border-t pt-3 text-xs text-muted-foreground">
          Sueldo base {formatPesos(r.baseCents)} · {r.absentDays} falta(s) · descuento {formatPesos(r.deductionCents)}.
        </p>
      </div>
    </div>
  )
}
