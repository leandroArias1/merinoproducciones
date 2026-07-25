'use client'

import { useState, useTransition } from 'react'
import { ASSIGNMENT_STATUSES, ASSIGNMENT_STATUS_LABELS, type AssignmentStatus } from '@/lib/events/schema'
import { setMyAssignmentStatusAction } from '~/app/supervisor/eventos/actions'

export function SupervisorAssignmentControls({
  assignmentId,
  eventId,
  status,
}: {
  assignmentId: string
  eventId: string
  status: string
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function change(next: AssignmentStatus) {
    setError(null)
    startTransition(async () => {
      const res = await setMyAssignmentStatusAction(assignmentId, next, eventId)
      if (!res.ok) return setError(res.error)
    })
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={status}
        disabled={pending}
        onChange={(e) => change(e.target.value as AssignmentStatus)}
        className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus-visible:border-primary"
      >
        {ASSIGNMENT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {ASSIGNMENT_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
