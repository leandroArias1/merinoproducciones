import { toNextJsHandler } from 'better-auth/next-js'
import { auth } from '@/lib/auth'

// Handler de Better Auth (login, logout, sesión). Sin registro público:
// el signup no se expone en la UI; los usuarios los crea el admin.
export const { GET, POST } = toNextJsHandler(auth)
