'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/events/status-badge'
import { previewImportAction, commitImportAction } from '~/app/admin/empleados/actions'
import type { ImportPreview } from '@/lib/employees/import'

// Sin fila de títulos a propósito: es la forma más corta de mostrar que no
// hace falta, que es justamente lo que el usuario no sabía.
const EJEMPLO = `Ana,Pérez,40111222,11-5555-5555,Sonido,Jornada completa L-V,2026-03-01
Juan,Gómez,38222333,11-4444-4444,Luces,Media jornada L-M,2025-08-15`

export function ImportWizard() {
  const router = useRouter()
  const [csv, setCsv] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ created: number; skipped: number } | null>(null)
  const [pending, startTransition] = useTransition()

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setCsv(await file.text())
  }

  function doPreview() {
    setError(null)
    setDone(null)
    setPreview(null)
    startTransition(async () => {
      const res = await previewImportAction(csv)
      if (!res.ok) return setError(res.error)
      setPreview(res.preview)
    })
  }

  function doCommit() {
    setError(null)
    startTransition(async () => {
      const res = await commitImportAction(csv)
      if (!res.ok) return setError(res.error)
      setDone(res.result)
      setPreview(null)
    })
  }

  if (done) {
    return (
      <div className="max-w-lg rounded-lg border p-6 text-center">
        <CheckCircle2 className="mx-auto size-8 text-[var(--success)]" />
        <p className="mt-3 text-sm font-medium">
          Importación completa: {done.created} creado(s), {done.skipped} salteado(s).
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button size="sm" onClick={() => router.push('/admin/empleados')}>
            Ver empleados
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setDone(null)
              setCsv('')
            }}
          >
            Importar otro
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">CSV de empleados</label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:bg-secondary [&_svg]:size-3.5">
            <Upload /> Subir archivo
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
          </label>
        </div>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={8}
          spellCheck={false}
          placeholder={EJEMPLO}
          className="w-full rounded-md border bg-background p-3 font-mono text-xs outline-none focus-visible:border-primary"
        />
        <p className="text-xs text-muted-foreground">
          Pegá o subí un CSV con las columnas en este orden: nombre, apellido, DNI, teléfono, cargo,
          categoría, fecha de ingreso. <span className="text-foreground">No hace falta fila de títulos.</span>{' '}
          Si igual la ponés, se reconoce sola. Separador coma o punto y coma.
        </p>
        <Button size="sm" onClick={doPreview} disabled={pending || !csv.trim()}>
          Previsualizar
        </Button>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {preview?.headerError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {preview.headerError}
        </p>
      )}

      {preview && !preview.headerError && (
        <div className="space-y-3">
          <div className="flex items-center gap-4 text-sm">
            <span className="inline-flex items-center gap-1.5 font-medium text-[var(--success)] [&_svg]:size-4">
              <CheckCircle2 /> {preview.toCreate} a crear
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground [&_svg]:size-4">
              <XCircle /> {preview.toSkip} a saltear
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Nombre</th>
                  <th className="px-3 py-2 font-medium">DNI</th>
                  <th className="px-3 py-2 font-medium">Categoría</th>
                  <th className="px-3 py-2 font-medium">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {preview.rows.map((r) => (
                  <tr key={r.rowNumber} className={r.status === 'skip' ? 'text-muted-foreground' : ''}>
                    <td className="px-3 py-2 tabular-nums">{r.rowNumber}</td>
                    <td className="px-3 py-2">
                      {r.values.firstName} {r.values.lastName}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{r.values.documentId || '—'}</td>
                    <td className="px-3 py-2">{r.values.category || '—'}</td>
                    <td className="px-3 py-2">
                      {r.status === 'create' ? (
                        <StatusBadge label="Crear" tone="success" />
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <StatusBadge label="Saltear" tone="danger" />
                          <span className="text-xs">{r.reason}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.toCreate > 0 ? (
            <div className="flex items-center gap-2">
              <Button onClick={doCommit} disabled={pending}>
                {pending ? 'Importando…' : `Confirmar e importar ${preview.toCreate}`}
              </Button>
              <span className="text-xs text-muted-foreground">
                Todo o nada: si falla una, no se importa ninguna.
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No hay filas válidas para importar.</p>
          )}
        </div>
      )}
    </div>
  )
}
