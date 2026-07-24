'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, ShieldCheck, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  editEntryAction,
  deleteEntryAction,
  markJustifiedAction,
  recalcDayAction,
} from '~/app/admin/asistencia/actions'

export interface EntryEdit {
  id: string
  checkInLocal: string
  checkOutLocal: string
}

export function DayCorrections({
  employeeId,
  workDateKey,
  entries,
}: {
  employeeId: string
  workDateKey: string
  entries: EntryEdit[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, { in: string; out: string }>>(() =>
    Object.fromEntries(entries.map((e) => [e.id, { in: e.checkInLocal, out: e.checkOutLocal }])),
  )

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) return setError(res.error ?? 'Error')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => recalcDayAction(employeeId, workDateKey))}>
          <RefreshCw /> Recalcular
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => markJustifiedAction(employeeId, workDateKey))}>
          <ShieldCheck /> Justificar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
          <Pencil /> Fichadas
        </Button>
      </div>

      {open && (
        <div className="w-full space-y-2 rounded-md bg-secondary p-3">
          {entries.length === 0 && <p className="text-xs text-muted-foreground">Sin fichadas este día.</p>}
          {entries.map((e) => (
            <div key={e.id} className="flex flex-wrap items-end justify-end gap-2">
              <input
                type="datetime-local"
                value={drafts[e.id]?.in ?? ''}
                onChange={(ev) => setDrafts((d) => ({ ...d, [e.id]: { ...d[e.id], in: ev.target.value } }))}
                className="h-8 rounded-md border bg-background px-2 text-xs"
              />
              <input
                type="datetime-local"
                value={drafts[e.id]?.out ?? ''}
                onChange={(ev) => setDrafts((d) => ({ ...d, [e.id]: { ...d[e.id], out: ev.target.value } }))}
                className="h-8 rounded-md border bg-background px-2 text-xs"
                placeholder="salida"
              />
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run(() => editEntryAction(e.id, drafts[e.id]?.in ?? '', drafts[e.id]?.out ?? ''))}
              >
                Guardar
              </Button>
              <button
                onClick={() => run(() => deleteEntryAction(e.id))}
                disabled={pending}
                className="rounded-md p-1.5 text-muted-foreground hover:text-destructive [&_svg]:size-4"
                title="Borrar fichada"
              >
                <Trash2 />
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
