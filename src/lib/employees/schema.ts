import { z } from 'zod'

/**
 * Schemas zod COMPARTIDOS entre cliente (react-hook-form) y servidor (parse en
 * la action). Un solo schema, no dos.
 */

const BA_ZONE = 'America/Argentina/Buenos_Aires'

/** Hoy en calendario Buenos Aires como 'YYYY-MM-DD' (sin dependencias). */
export function todayInBA(): string {
  // en-CA formatea como YYYY-MM-DD; con timeZone da el día de negocio real.
  return new Intl.DateTimeFormat('en-CA', { timeZone: BA_ZONE }).format(new Date())
}

/** DNI/CUIL argentino: solo dígitos, 7 u 8. Reutilizable (form + importador CSV). */
export const DOCUMENT_ID_RE = /^\d{7,8}$/

/**
 * Alias bancario (6-20: letras, números, punto y guion) o CBU/CVU (22 dígitos).
 *
 * Se valida SOLO lo que se sabe con certeza del formato. Deliberadamente NO se
 * exige que empiece o termine con letra, ni que tenga al menos una letra, ni se
 * normaliza a minúsculas: son reglas de las que no tengo confirmación, y un
 * alias legítimo rechazado por una regla inventada es peor que uno dudoso que
 * el banco va a rechazar igual — el usuario no entendería por qué no puede
 * cargar un dato correcto.
 *
 * Tampoco se transforma lo que se escribe: es un identificador de pago, se
 * guarda tal cual (solo se recortan espacios de los bordes).
 */
export const ALIAS_RE = /^[A-Za-z0-9.-]{6,20}$/
export const CBU_RE = /^\d{22}$/
export const ALIAS_MSG =
  'Alias inválido: 6 a 20 caracteres (letras, números, punto y guion), o un CBU/CVU de 22 dígitos.'

/** 'YYYY-MM-DD' de hace N años, para acotar la fecha de nacimiento. */
function hoyMenosAnios(n: number): string {
  const hoy = todayInBA()
  return `${Number(hoy.slice(0, 4)) - n}${hoy.slice(4)}`
}

// dayOfWeek 0=domingo..6=sábado. Minutos desde 00:00 hora BA.
export const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const

export const EMPLOYMENT_TYPES = ['MONTHLY', 'DAILY', 'HOURLY', 'PER_EVENT'] as const
export const EMPLOYMENT_TYPE_LABELS: Record<(typeof EMPLOYMENT_TYPES)[number], string> = {
  MONTHLY: 'Mensual',
  DAILY: 'Jornal',
  HOURLY: 'Por hora',
  // El valor guardado sigue siendo PER_EVENT: solo cambia cómo se lee. El
  // schema ya lo describía como "freelance / cachet por evento".
  PER_EVENT: 'Freelance',
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
  documentId: z
    .string()
    .trim()
    .refine((v) => DOCUMENT_ID_RE.test(v), 'El DNI debe ser numérico, de 7 u 8 dígitos.'),
  email: z
    .string()
    .trim()
    .max(120)
    .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Email inválido')
    .optional()
    .default(''),
  phone: z.string().trim().max(30).optional().default(''),
  // Bloquea en vez de avisar: una fecha de nacimiento fuera de rango siempre es
  // un error de carga (típico: el año mal tipeado), nunca un caso real.
  birthDate: z
    .string()
    .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Fecha inválida')
    .refine((v) => v === '' || v <= todayInBA(), 'La fecha de nacimiento no puede ser futura.')
    .refine((v) => v === '' || v <= hoyMenosAnios(16), 'El empleado tiene que tener al menos 16 años.')
    .refine((v) => v === '' || v >= hoyMenosAnios(100), 'Revisá el año: esa fecha da más de 100 años.')
    .optional()
    .default(''),
  alias: z
    .string()
    .trim()
    .refine((v) => v === '' || ALIAS_RE.test(v) || CBU_RE.test(v), ALIAS_MSG)
    .optional()
    .default(''),
  position: z.string().trim().max(60).optional().default(''),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  hireDate: z
    .string()
    .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Fecha inválida')
    .refine((v) => v === '' || v <= todayInBA(), 'La fecha de ingreso no puede ser futura.')
    .optional()
    .default(''),
  categoryId: z.string().optional().default(''),
  active: z.boolean(),
})

export type EmployeeInput = z.infer<typeof employeeSchema>
// Tipo de ENTRADA del schema (campos opcionales con default): es el que usa el
// formulario, porque zodResolver resuelve al input, no al output.
export type EmployeeFormValues = z.input<typeof employeeSchema>
