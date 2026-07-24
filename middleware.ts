import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

/**
 * Gate grueso en el edge: ¿hay cookie de sesión o no? Sin ella, redirige a
 * /login. NO valida el rol ni toca la DB (eso lo hace el guard server-side en
 * cada layout, con `requireRole`). Rápido y edge-safe.
 *
 * El matcher excluye `/api` (auth y cron manejan su propia autorización:
 * el cron usa CRON_SECRET, no cookie), los assets y /login.
 */
export function middleware(req: NextRequest): NextResponse {
  const sessionCookie = getSessionCookie(req)
  if (!sessionCookie) {
    const url = new URL('/login', req.url)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|login).*)'],
}
