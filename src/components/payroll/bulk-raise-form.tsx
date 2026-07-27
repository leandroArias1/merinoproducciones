'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { MoneyEcho } from '@/components/ui/money-echo'
import { bulkRaiseAction } from '~/app/admin/liquidaciones/actions'
import { efectoEnElMes } from './raise-preview'

export interface RaiseEmployeeVM {
  id: string
  name: string
  categoryName: string
  vigente: string // ya formateado ($…) o '—'
}

const hoyKey = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })

export function BulkRaiseForm({ employees }: { employees: RaiseEmployeeVM[] }) {
  const [pending, startTransition] = useTransition()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pesos, setPesos] = useState('')
  const [desde, setDesde] = useState(hoyKey())
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ count: number; pesos: number } | null>(null)

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }
  function toggleAll() {
    setSelected((s) => (s.size === employees.length ? new Set() : new Set(employees.map((e) => e.id))))
  }

  const monto = Number(pesos)
  const fechaOk = /^\d{4}-\d{2}-\d{2}$/.test(desde)
  const valid = selected.size > 0 && Number.isInteger(monto) && monto > 0 && fechaOk
  const efecto = fechaOk && monto > 0 ? efectoEnElMes(desde, monto) : null

  function submit() {
    if (!valid) return
    setError(null)
    startTransition(async () => {
      const res = await bulkRaiseAction([...selected], monto, desde)
      if (!res.ok) return setError(res.error ?? 'Error.')
      setDone({ count: selected.size, pesos: monto })
      setSelected(new Set())
      setPesos('')
    })
  }

  if (done) {
    const fmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(done.pesos)
    return (
      <div className="max-w-lg rounded-lg border p-6 text-center">
        <p className="text-sm font-medium">Aumento aplicado a {done.count} empleado(s): nuevo sueldo {fmt}.</p>
        <p className="mt-1 text-xs text-muted-foreground">Cada uno versionó su propio historial de sueldo (auditado).</p>
        <Button size="sm" className="mt-4" onClick={() => setDone(null)}>
          Aplicar otro
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="space-y-3 rounded-lg border bg-surface p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="raise-monto" className="text-xs font-medium text-muted-foreground">
              Nuevo sueldo mensual (pesos)
            </label>
            <input
              id="raise-monto"
              type="number"
              min={0}
              step={1}
              value={pesos}
              onChange={(e) => setPesos(e.target.value)}
              placeholder="750000"
              className="num h-9 w-40 rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-primary"
            />
            <MoneyEcho raw={pesos} />
          </div>
          <div className="space-y-1">
            <label htmlFor="raise-desde" className="text-xs font-medium text-muted-foreground">
              Rige desde
            </label>
            <input
              id="raise-desde"
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-primary"
            />
          </div>
          <Button size="sm" disabled={!valid} loading={pending} onClick={submit}>
            Aplicar a {selected.size} seleccionado(s)
          </Button>
          {error && <span className="self-center text-xs text-destructive">{error}</span>}
        </div>

        {/* El efecto ANTES de aplicar: sin esto, elegir una fecha a mitad de mes
            prorratea en silencio y el recibo sale por menos de lo esperado. */}
        {efecto && (
          <p className="rounded-md bg-paper px-3 py-2 text-xs text-muted-foreground">
            {efecto.completo ? (
              <>
                En <span className="first-letter:uppercase">{efecto.mesLabel}</span> cobran el{' '}
                <b className="text-foreground">sueldo completo</b>, porque rige desde el primer día del mes.
              </>
            ) : (
              <>
                Ojo: en <span className="first-letter:uppercase">{efecto.mesLabel}</span> se prorratea. Cobran{' '}
                <b className="num text-foreground">$ {efecto.cobra.toLocaleString('es-AR')}</b> de{' '}
                <span className="num">$ {monto.toLocaleString('es-AR')}</span>, por {efecto.diasVigentes} de{' '}
                {efecto.diasDelMes} días. Elegí el día 1 para el mes completo.
              </>
            )}
          </p>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">
                <input type="checkbox" checked={selected.size === employees.length && employees.length > 0} onChange={toggleAll} aria-label="Seleccionar todos" />
              </th>
              <th className="px-4 py-2.5 font-medium">Empleado</th>
              <th className="px-4 py-2.5 font-medium">Categoría</th>
              <th className="px-4 py-2.5 font-medium">Sueldo vigente</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {employees.map((e) => (
              <tr key={e.id} className="hover:bg-secondary/50">
                <td className="px-4 py-2.5">
                  <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} aria-label={`Seleccionar ${e.name}`} />
                </td>
                <td className="px-4 py-2.5 font-medium">{e.name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{e.categoryName}</td>
                <td className="px-4 py-2.5 tabular-nums">{e.vigente}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
