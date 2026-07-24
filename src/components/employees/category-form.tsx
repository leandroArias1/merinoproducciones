'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { categorySchema, DAY_LABELS } from '@/lib/employees/schema'
import { minutesToHHMM, hhmmToMinutes } from '@/lib/employees/format'
import { createCategoryAction, updateCategoryAction } from '~/app/admin/categorias/actions'

interface DayRow {
  enabled: boolean
  start: string
  end: string
}
interface FormValues {
  name: string
  description: string
  days: DayRow[]
}

export interface CategoryInitial {
  id: string
  name: string
  description: string | null
  days: { dayOfWeek: number; startMinute: number; endMinute: number }[]
}

function toDefaults(initial?: CategoryInitial): FormValues {
  const rows: DayRow[] = DAY_LABELS.map(() => ({ enabled: false, start: '09:00', end: '17:00' }))
  if (initial) {
    for (const d of initial.days) {
      rows[d.dayOfWeek] = { enabled: true, start: minutesToHHMM(d.startMinute), end: minutesToHHMM(d.endMinute) }
    }
  }
  return { name: initial?.name ?? '', description: initial?.description ?? '', days: rows }
}

export function CategoryForm({ initial }: { initial?: CategoryInitial }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit } = useForm<FormValues>({ defaultValues: toDefaults(initial) })

  function onSubmit(values: FormValues) {
    setError(null)
    // Un solo tramo por día por construcción (una fila por día): imposible
    // cargar turnos partidos desde la UI.
    const days = values.days
      .map((d, i) =>
        d.enabled ? { dayOfWeek: i, startMinute: hhmmToMinutes(d.start), endMinute: hhmmToMinutes(d.end) } : null,
      )
      .filter((d): d is NonNullable<typeof d> => d !== null)

    // MISMO schema zod que valida el servidor.
    const parsed = categorySchema.safeParse({ name: values.name, description: values.description, days })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos.')
      return
    }

    startTransition(async () => {
      const res = initial
        ? await updateCategoryAction(initial.id, parsed.data)
        : await createCategoryAction(parsed.data)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.push('/admin/categorias')
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Nombre</label>
          <input
            {...register('name')}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-primary"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Descripción</label>
          <input
            {...register('description')}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-primary"
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Plantilla de horario</p>
        <div className="divide-y rounded-md border">
          {DAY_LABELS.map((label, i) => (
            <div key={label} className="grid grid-cols-[7rem_1fr_1fr] items-center gap-3 px-3 py-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" {...register(`days.${i}.enabled`)} className="size-4 accent-primary" />
                {label}
              </label>
              <input
                type="time"
                {...register(`days.${i}.start`)}
                className="h-8 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-primary"
              />
              <input
                type="time"
                {...register(`days.${i}.end`)}
                className="h-8 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-primary"
              />
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Un turno por día. No se admiten turnos partidos.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : initial ? 'Guardar cambios' : 'Crear categoría'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.push('/admin/categorias')}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
