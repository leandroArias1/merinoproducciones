'use client'

import { Trash2 } from 'lucide-react'
import { ConfirmButton } from '@/components/ui/confirm-dialog'
import { deleteCategoryAction } from '~/app/admin/categorias/actions'

export function DeleteCategoryButton({ id, name }: { id: string; name: string }) {
  return (
    <ConfirmButton
      size="sm"
      variant="ghost"
      aria-label={`Borrar ${name}`}
      className="px-2 hover:text-destructive"
      title={`¿Borrar el horario "${name}"?`}
      description="Los empleados que ya lo tengan asignado conservan el horario que se les generó; sólo deja de estar disponible para asignar a alguien nuevo."
      confirmLabel="Sí, borrar"
      onConfirm={() => deleteCategoryAction(id)}
    >
      <Trash2 />
    </ConfirmButton>
  )
}
