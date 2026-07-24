'use client'

import { useEffect, useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CalendarCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
    formState: { errors },
  } = useForm<AssignmentFormValues>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: initial ?? { employeeId: '', role: 'Armado', isSupervisor: false, startAt: '', endAt: '' },
  })

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
      onDone?.()
      router.refresh()
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
          <label className="text-sm font-medium">Tarea</label>
          <input list="roles" {...register('role')} className={inputCls} />
          <datalist id="roles">
            {ASSIGNMENT_ROLES.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
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

      {/* TRAMPA #1 — a qué día imputa, explícito */}
      {preview && (
        <div className="rounded-md bg-secondary px-3 py-2 text-sm">
          <span className="inline-flex items-center gap-1.5 font-medium [&_svg]:size-4">
            <CalendarCheck /> Se registra en el {preview.workDateLabel}
          </span>
        </div>
      )}

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
