'use client'

import { useEffect, useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CalendarCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SelectConOtra } from '@/components/ui/select-con-otra'
import { assignmentSchema, type AssignmentFormValues, ASSIGNMENT_ROLES } from '@/lib/events/schema'
import {
  createAssignmentAction,
  updateAssignmentAction,
  assignmentPreviewAction,
  type PreviewResult,
} from '~/app/admin/eventos/actions'

const inputCls = 'h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-primary'

export interface AssignmentInitial extends AssignmentFormValues {
  id: string
}

export function AssignmentForm({
  eventId,
  employees,
  initial,
  onDone,
}: {
  eventId: string
  employees: { id: string; name: string }[]
  initial?: AssignmentInitial
  onDone?: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewResult | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<AssignmentFormValues>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: initial ?? { employeeId: '', role: 'Armado', isSupervisor: false, startAt: '', endAt: '' },
  })

  // La tarea se elige de una lista (ver SelectConOtra): "Armado" siempre es
  // "Armado" y no "armado"/"ARMADO", que quedaban como tareas distintas.
  const role = watch('role')

  const employeeId = watch('employeeId')
  const startAt = watch('startAt')
  const endAt = watch('endAt')

  // TRAMPA #1 y #2: apenas hay empleado + horario, mostramos a qué día imputa
  // y los conflictos (turnos solapados / licencia). No bloquea el guardado.
  useEffect(() => {
    if (!employeeId || !startAt || !endAt) {
      setPreview(null)
      return
    }
    let cancel = false
    const t = setTimeout(async () => {
      const res = await assignmentPreviewAction({ employeeId, startAt, endAt, excludeId: initial?.id })
      if (!cancel) setPreview(res)
    }, 250)
    return () => {
      cancel = true
      clearTimeout(t)
    }
  }, [employeeId, startAt, endAt, initial?.id])

  function onSubmit(values: AssignmentFormValues) {
    setError(null)
    startTransition(async () => {
      const res = initial
        ? await updateAssignmentAction(initial.id, eventId, values)
        : await createAssignmentAction(eventId, values)
      if (!res.ok) return setError(res.error)

      // El refresco NO se deja librado a la respuesta de la action. La action
      // revalida bien, pero `onDone()` desmonta este formulario en el mismo
      // tick en que llega esa respuesta: si el desmontaje gana la carrera, el
      // árbol nuevo se descarta y la asignación recién creada no aparece en la
      // lista hasta salir y volver a entrar. Depende de la latencia, así que en
      // una conexión lenta pasa siempre y en una rápida no pasa nunca.
      //
      // El costo es un refetch de esta pantalla; el riesgo que evita es que el
      // usuario crea que no se guardó y cargue a la misma persona dos veces.
      router.refresh()
      onDone?.()
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-lg border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Empleado</label>
          <select {...register('employeeId')} className={inputCls}>
            <option value="">Elegir…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          {errors.employeeId && <p className="text-xs text-destructive">{errors.employeeId.message}</p>}
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="tarea">
            Tarea
          </label>
          <SelectConOtra
            id="tarea"
            className={inputCls}
            opciones={ASSIGNMENT_ROLES}
            value={role}
            onChange={(v) => setValue('role', v, { shouldValidate: v !== '' })}
            placeholder="Escribí la tarea"
            textoAriaLabel="Tarea personalizada"
          />
          {errors.role && <p className="text-xs text-destructive">{errors.role.message}</p>}
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Inicio</label>
          <input type="datetime-local" {...register('startAt')} className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Fin</label>
          <input type="datetime-local" {...register('endAt')} className={inputCls} />
          {errors.endAt && <p className="text-xs text-destructive">{errors.endAt.message}</p>}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register('isSupervisor')} className="size-4 accent-primary" />
        Es supervisor de este turno
      </label>

      {/* TRAMPA #1 — a qué día imputa, explícito.
          El hueco se reserva SIEMPRE, aunque todavía no haya nada que mostrar:
          antes aparecía recién al completar las fechas y empujaba el botón
          "Asignar" hacia abajo justo cuando el usuario iba a apretarlo, así
          que el clic se le iba al vacío. */}
      <div className="min-h-9">
        {preview && (
          <div className="rounded-md bg-secondary px-3 py-2 text-sm">
            <span className="inline-flex items-center gap-1.5 font-medium [&_svg]:size-4">
              <CalendarCheck /> Se registra en el {preview.workDateLabel}
            </span>
          </div>
        )}
      </div>

      {/* TRAMPA #2 — conflictos: avisan, no bloquean */}
      {preview && (preview.overlaps.length > 0 || preview.leaveType) && (
        <div className="space-y-1 rounded-md border border-[var(--warning)]/40 bg-[color-mix(in_oklch,var(--warning)_8%,transparent)] px-3 py-2 text-sm text-[var(--warning)]">
          {preview.overlaps.map((o, i) => (
            <p key={i} className="inline-flex items-center gap-1.5 [&_svg]:size-4">
              <AlertTriangle /> Se solapa con “{o.role}” de {o.eventName}
            </p>
          ))}
          {preview.leaveType && (
            <p className="inline-flex items-center gap-1.5 [&_svg]:size-4">
              <AlertTriangle /> Tiene licencia aprobada ese día ({preview.leaveType})
            </p>
          )}
        </div>
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Guardando…' : initial ? 'Guardar' : 'Asignar'}
        </Button>
        {onDone && (
          <Button type="button" variant="secondary" size="sm" onClick={onDone}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  )
}
