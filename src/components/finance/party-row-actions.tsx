'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmButton } from '@/components/ui/confirm-dialog'
import { updatePartyAction, deletePartyAction } from '~/app/admin/caja/actions'

/**
 * Editar (nombre + notas) y eliminar un cliente/proveedor desde su fila.
 *
 * SIN `router.refresh()`: la action ya llama `revalidatePath`, y en App Router
 * eso hace que la respuesta del POST traiga el árbol actualizado. Agregar un
 * refresh dispara un SEGUNDO render completo de la página (medido: +2,5 s por
 * clic). La pantalla se actualiza igual con el POST solo.
 */
export function PartyRowActions({ id, name, notes, kindLabel }: { id: string; name: string; notes: string | null; kindLabel: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [n, setN] = useState(name)
  const [nt, setNt] = useState(notes ?? '')

  function save() {
    if (!n.trim()) return
    setError(null)
    startTransition(async () => {
      const res = await updatePartyAction(id, n.trim(), nt.trim() || undefined)
      if (!res.ok) return setError(res.error ?? 'Error.')
      setEditing(false)
    })
  }

  if (editing) {
    return (
      <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
        <input autoFocus value={n} onChange={(e) => setN(e.target.value)} placeholder="Nombre" className="h-8 w-36 rounded-md border bg-background px-2 text-sm" />
        <input value={nt} onChange={(e) => setNt(e.target.value)} placeholder="Notas (opcional)" className="h-8 w-44 rounded-md border bg-background px-2 text-sm" />
        <Button size="sm" disabled={!n.trim()} loading={pending} onClick={save}>
          Guardar
        </Button>
        <button className="text-xs text-muted-foreground underline" onClick={() => { setEditing(false); setN(name); setNt(notes ?? '') }}>
          cancelar
        </button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => setEditing(true)}>
        Editar
      </Button>
      <ConfirmButton
        size="sm"
        variant="ghost"
        title={`¿Eliminar a ${name}?`}
        description={`Sale de la agenda de ${kindLabel}s, pero se conserva en los eventos y gastos que ya lo tienen cargado: esos no cambian.`}
        confirmLabel="Sí, eliminar"
        onConfirm={() => deletePartyAction(id)}
      >
        Eliminar
      </ConfirmButton>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  )
}
