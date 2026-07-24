'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { deleteCategoryAction } from '~/app/admin/categorias/actions'

export function DeleteCategoryButton({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onDelete() {
    if (!confirm(`¿Borrar la categoría "${name}"?`)) return
    setError(null)
    startTransition(async () => {
      const res = await deleteCategoryAction(id)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={onDelete}
        disabled={pending}
        title="Borrar"
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive disabled:opacity-50 [&_svg]:size-4"
      >
        <Trash2 />
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  )
}
