import { headers } from 'next/headers'
import { decideAccess, type AppRole } from './access'
import { getAppSession, type AppSession } from './session'

/**
 * BLINDAJE de mutaciones. El middleware es un gate grueso y los `requireRole`
 * de los layouts protegen PÁGINAS; las Server Actions y los Route Handlers NO
 * pasan por ninguno. Cada Server Action es un endpoint HTTP público invocable
 * con cualquier sesión. Por eso TODA action/handler que muta pasa por acá.
 *
 * Ver CLAUDE.md: regla dura.
 */

export type ActionErrorCode = 'FORBIDDEN' | 'VALIDATION' | 'CONFLICT' | 'NOT_FOUND'

export class ActionError extends Error {
  constructor(
    public code: ActionErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ActionError'
  }
}

export interface ActionContext {
  session: AppSession
  actorId: string
}

/**
 * Núcleo de autorización, TESTEABLE: recibe la sesión ya resuelta. Default
 * DENEGAR. Toda action pasa por este chequeo.
 */
export async function guardAction<R>(
  allowed: AppRole[],
  session: AppSession | null,
  fn: (ctx: ActionContext) => Promise<R>,
): Promise<R> {
  if (!decideAccess(session, allowed).ok) {
    throw new ActionError('FORBIDDEN', 'No tenés permiso para esta acción.')
  }
  return fn({ session: session as AppSession, actorId: (session as AppSession).user.id })
}

/**
 * Wrapper de producción. Resuelve la sesión del request (cookies) y delega en
 * guardAction. NINGUNA Server Action ni Route Handler se escribe sin esto.
 */
export function action<A extends unknown[], R>(
  allowed: AppRole[],
  fn: (ctx: ActionContext, ...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    const session = await getAppSession(await headers())
    return guardAction(allowed, session, (ctx) => fn(ctx, ...args))
  }
}
