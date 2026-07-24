'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { deleteEmployeeAction } from '~/app/admin/empleados/actions'

export function DeleteEmployeeButton({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onDelete() {
    if (!confirm(`¿Dar de baja a ${name}? Se conserva el historial (soft delete).`)) return
    setError(null)
    startTransition(async () => {
      const res = await deleteEmployeeAction(id)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.push('/admin/empleados')
      router.refresh()
    })
  }

  return (
    <div className="inline-flex items-center gap-2">
      <Button variant="destructive" size="sm" onClick={onDelete} disabled={pending}>
        {pending ? 'Dando de baja…' : 'Dar de baja'}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
