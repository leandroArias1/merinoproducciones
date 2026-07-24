'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { eventSchema, type EventFormValues } from '@/lib/events/schema'
import { createEventAction, updateEventAction } from '~/app/admin/eventos/actions'

const inputCls = 'h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-primary'

export interface EventInitial extends EventFormValues {
  id: string
}

export function EventForm({ initial }: { initial?: EventInitial }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: initial ?? { name: '', client: '', venue: '', startAt: '', endAt: '' },
  })

  function onSubmit(values: EventFormValues) {
    setError(null)
    startTransition(async () => {
      const res = initial ? await updateEventAction(initial.id, values) : await createEventAction(values)
      if (!res.ok) return setError(res.error)
      router.push(initial ? `/admin/eventos/${initial.id}` : `/admin/eventos/${res.id}`)
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-sm font-medium">Nombre</label>
          <input {...register('name')} className={inputCls} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Cliente</label>
          <input {...register('client')} className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Lugar</label>
          <input {...register('venue')} className={inputCls} />
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
      <p className="text-xs text-muted-foreground">Horas en zona Argentina/Buenos Aires.</p>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : initial ? 'Guardar cambios' : 'Crear evento'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
