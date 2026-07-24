import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { prisma } from '@/lib/db'

/**
 * Configuración de Better Auth (capa de datos: sesiones y credenciales).
 *
 * `role` va como campo adicional del User. En la DB es el enum `UserRole`
 * (ADMIN/SUPERVISOR/EMPLOYEE); acá Better Auth lo ve como string —
 * Postgres acepta el literal del enum, así que el runtime funciona.
 *
 * INVARIANTE CRÍTICA: `defaultValue` TIENE que ser un valor válido de
 * UserRole. En un signUp sin role, Better Auth escribe este default; si
 * fuera "user" (el default del admin plugin, que NO usamos) reventaría el
 * enum con "invalid input value for enum". Verificado: signUp sin role →
 * escribe 'EMPLOYEE'. `input: false` impide además inyectar un role inválido
 * desde el signup público. Si algún día se suma el admin plugin, revisar esto.
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'EMPLOYEE',
        input: false,
      },
    },
  },
})
