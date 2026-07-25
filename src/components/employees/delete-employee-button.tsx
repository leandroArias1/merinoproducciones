'use client'

import { useRouter } from 'next/navigation'
import { ConfirmButton } from '@/components/ui/confirm-dialog'
import { deleteEmployeeAction } from '~/app/admin/empleados/actions'

export function DeleteEmployeeButton({ id, name }: { id: string; name: string }) {
  const router = useRouter()

  return (
    <ConfirmButton
      variant="destructive"
      size="sm"
      title={`¿Dar de baja a ${name}?`}
      description="Sale del listado y deja de generársele asistencia, pero se conserva todo el historial: sus fichadas, sus recibos y sus liquidaciones anteriores quedan intactos."
      confirmLabel="Sí, dar de baja"
      onConfirm={async () => {
        const res = await deleteEmployeeAction(id)
        if (!res.ok) return res
        // El legajo sale del listado: hay que salir de su ficha.
        router.push('/admin/empleados')
        router.refresh()
        return res
      }}
    >
      Dar de baja
    </ConfirmButton>
  )
}
