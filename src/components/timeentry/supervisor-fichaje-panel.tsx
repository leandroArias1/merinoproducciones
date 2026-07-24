'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getBrowserLocation } from './geo'
import {
  supervisorToggleClockAction,
  supervisorRetroactiveAction,
} from '~/app/supervisor/eventos/actions'

export interface Member {
  employeeId: string
  name: string
  isOpen: boolean
}

export function SupervisorFichajePanel({ eventId, members }: { eventId: string; members: Member[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [retroFor, setRetroFor] = useState<string | null>(null)
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')

  function toggle(employeeId: string) {
    setError(null)
    startTransition(async () => {
      const loc = await getBrowserLocation()
      const res = await supervisorToggleClockAction(eventId, employeeId, loc)
      if (!res.ok) return setError(res.error)
      router.refresh()
    })
  }

  function toggleAll(entrada: boolean) {
    setError(null)
    startTransition(async () => {
      const loc = await getBrowserLocation()
      for (const m of members) {
        if (entrada === m.isOpen) continue // ya está en el estado deseado
        const res = await supervisorToggleClockAction(eventId, m.employeeId, loc)
        if (!res.ok) {
          setError(res.error)
          break
        }
      }
      router.refresh()
    })
  }

  function saveRetro(employeeId: string) {
    setError(null)
    startTransition(async () => {
      const res = await supervisorRetroactiveAction(eventId, employeeId, checkIn, checkOut)
      if (!res.ok) return setError(res.error)
      setRetroFor(null)
      setCheckIn('')
      setCheckOut('')
      router.refresh()
    })
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Fichaje del equipo</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => toggleAll(true)}>
            Entrada a todos
          </Button>
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => toggleAll(false)}>
            Salida a todos
          </Button>
        </div>
      </div>

      <ul className="divide-y rounded-lg border">
        {members.map((m) => (
          <li key={m.employeeId} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">{m.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {m.isOpen ? 'Fichado (entrada abierta)' : 'Sin fichar'}
                </span>
                <Button size="sm" disabled={pending} onClick={() => toggle(m.employeeId)}>
                  <Clock /> {m.isOpen ? 'Salida' : 'Entrada'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setRetroFor(retroFor === m.employeeId ? null : m.employeeId)}
                  title="Cargar fichada retroactiva (no había señal)"
                >
                  <History />
                </Button>
              </div>
            </div>

            {retroFor === m.employeeId && (
              <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md bg-secondary p-3">
                <div>
                  <label className="block text-xs text-muted-foreground">Entrada</label>
                  <input
                    type="datetime-local"
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                    className="h-8 rounded-md border bg-background px-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground">Salida</label>
                  <input
                    type="datetime-local"
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                    className="h-8 rounded-md border bg-background px-2 text-sm"
                  />
                </div>
                <Button size="sm" disabled={pending} onClick={() => saveRetro(m.employeeId)}>
                  Guardar
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  )
}
