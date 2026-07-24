import { z } from 'zod'

export const EVENT_STATUSES = ['DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const
export type EventStatus = (typeof EVENT_STATUSES)[number]
export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  DRAFT: 'Borrador',
  CONFIRMED: 'Confirmado',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Finalizado',
  CANCELLED: 'Cancelado',
}

export const ASSIGNMENT_STATUSES = ['PLANNED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] as const
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number]
export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  PLANNED: 'Planificado',
  CONFIRMED: 'Confirmado',
  COMPLETED: 'Cumplido',
  CANCELLED: 'Cancelado',
}

// Roles sugeridos (texto libre igual).
export const ASSIGNMENT_ROLES = ['Armado', 'Show', 'Desarmado', 'Transporte'] as const

export const eventSchema = z
  .object({
    name: z.string().trim().min(1, 'Requerido').max(120),
    client: z.string().trim().max(120).optional().default(''),
    venue: z.string().trim().max(120).optional().default(''),
    // datetime-local en hora BA ("YYYY-MM-DDTHH:mm").
    startAt: z.string().min(1, 'Requerido'),
    endAt: z.string().min(1, 'Requerido'),
  })
  .refine((v) => v.endAt > v.startAt, { message: 'El fin debe ser posterior al inicio.', path: ['endAt'] })

export type EventInput = z.infer<typeof eventSchema>
export type EventFormValues = z.input<typeof eventSchema>

export const assignmentSchema = z
  .object({
    employeeId: z.string().min(1, 'Elegí un empleado.'),
    role: z.string().trim().min(1, 'Requerido').max(60),
    isSupervisor: z.boolean(),
    startAt: z.string().min(1, 'Requerido'),
    endAt: z.string().min(1, 'Requerido'),
  })
  .refine((v) => v.endAt > v.startAt, { message: 'El fin debe ser posterior al inicio.', path: ['endAt'] })

export type AssignmentInput = z.infer<typeof assignmentSchema>
export type AssignmentFormValues = z.input<typeof assignmentSchema>
