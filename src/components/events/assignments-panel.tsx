'use client'

import { useState, useTransition } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge, assignmentTone } from './status-badge'
import { AssignmentForm } from './assignment-form'
import { ASSIGNMENT_STATUSES, ASSIGNMENT_STATUS_LABELS, type AssignmentStatus } from '@/lib/events/schema'
import { setAssignmentStatusAction, deleteAssignmentAction } from '~/app/admin/eventos/actions'

export interface AssignmentRow {
  id: string
  employeeName: string
  role: string
  isSupervisor: boolean
  status: string
  startLabel: string
  endLabel: string
  workDateLabel: string
}

export function AssignmentsPanel({
  eventId,
  employees,
  assignments,
}: {
  eventId: string
  employees: { id: string; name: string }[]
  assignments: AssignmentRow[]
}) {
  const [adding, setAdding] = useState(false)
  const [pending, startTransition] = useTransition()

  function changeStatus(id: string, status: AssignmentStatus) {
    startTransition(async () => {
      await setAssignmentStatusAction(id, status, eventId)
    })
  }
  function remove(id: string) {
    if (!confirm('¿Quitar esta asignación?')) return
    startTransition(async () => {
      await deleteAssignmentAction(id, eventId)
    })
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Asignaciones</h2>
        {!adding && (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus /> Agregar
          </Button>
        )}
      </div>

      {adding && (
        <div className="mb-4">
          <AssignmentForm eventId={eventId} employees={employees} onDone={() => setAdding(false)} />
        </div>
      )}

      {assignments.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Sin asignaciones todavía.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {assignments.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{a.employeeName}</span>
                  {a.isSupervisor && <StatusBadge label="Supervisor" tone="accent" />}
                </div>
                <div className="text-xs text-muted-foreground">
                  {a.role} · {a.startLabel}–{a.endLabel} · imputa al {a.workDateLabel}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge label={ASSIGNMENT_STATUS_LABELS[a.status as AssignmentStatus]} tone={assignmentTone(a.status)} />
                <select
                  value={a.status}
                  disabled={pending}
                  onChange={(e) => changeStatus(a.id, e.target.value as AssignmentStatus)}
                  className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus-visible:border-primary"
                >
                  {ASSIGNMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {ASSIGNMENT_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => remove(a.id)}
                  disabled={pending}
                  title="Quitar"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive [&_svg]:size-4"
                >
                  <X />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
