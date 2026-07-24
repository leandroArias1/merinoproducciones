import { z } from 'zod'

/**
 * Schemas zod COMPARTIDOS entre cliente (react-hook-form) y servidor (parse en
 * la action). Un solo schema, no dos.
 */

// dayOfWeek 0=domingo..6=sábado. Minutos desde 00:00 hora BA.
export const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const

export const EMPLOYMENT_TYPES = ['MONTHLY', 'DAILY', 'HOURLY', 'PER_EVENT'] as const
export const EMPLOYMENT_TYPE_LABELS: Record<(typeof EMPLOYMENT_TYPES)[number], string> = {
  MONTHLY: 'Mensual',
  DAILY: 'Jornal',
  HOURLY: 'Por hora',
  PER_EVENT: 'Por evento',
}

const tramoSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
  })
  .refine((t) => t.endMinute > t.startMinute, {
    message: 'La hora de fin debe ser posterior a la de inicio.',
    path: ['endMinute'],
  })

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Requerido').max(80),
  description: z.string().trim().max(200).optional().default(''),
  days: z
    .array(tramoSchema)
    .min(1, 'Cargá al menos un día.')
    // UN solo tramo por día: el motor no soporta turnos partidos, así que la
    // UI los IMPIDE en vez de permitirlos y romper el barrido después.
    .refine((days) => new Set(days.map((d) => d.dayOfWeek)).size === days.length, {
      message: 'No se permite más de un turno por día (turnos partidos).',
    }),
})

export type CategoryInput = z.infer<typeof categorySchema>

export const employeeSchema = z.object({
  firstName: z.string().trim().min(1, 'Requerido').max(60),
  lastName: z.string().trim().min(1, 'Requerido').max(60),
  documentId: z.string().trim().min(1, 'Requerido').max(20),
  email: z
    .string()
    .trim()
    .max(120)
    .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Email inválido')
    .optional()
    .default(''),
  phone: z.string().trim().max(30).optional().default(''),
  position: z.string().trim().max(60).optional().default(''),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  hireDate: z
    .string()
    .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Fecha inválida')
    .optional()
    .default(''),
  categoryId: z.string().optional().default(''),
  active: z.boolean(),
})

export type EmployeeInput = z.infer<typeof employeeSchema>
// Tipo de ENTRADA del schema (campos opcionales con default): es el que usa el
// formulario, porque zodResolver resuelve al input, no al output.
export type EmployeeFormValues = z.input<typeof employeeSchema>
