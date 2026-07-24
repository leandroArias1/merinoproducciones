import { describe, it, expect, vi } from 'vitest'
import { guardAction, ActionError } from './action'
import type { AppSession } from './session'
import type { AppRole } from './access'

function sessionOf(role: AppRole): AppSession {
  return {
    user: { id: `u-${role}`, email: `${role}@x.com`, name: role, role },
    role,
    employee: null,
  }
}

describe('guardAction — blindaje de mutaciones', () => {
  it('una action de ADMIN con sesión de EMPLEADO FALLA (no ejecuta el fn)', async () => {
    const fn = vi.fn(async () => 'ejecutado')
    await expect(guardAction(['ADMIN'], sessionOf('EMPLOYEE'), fn)).rejects.toBeInstanceOf(ActionError)
    expect(fn).not.toHaveBeenCalled()
  })

  it('sin sesión → FALLA', async () => {
    const fn = vi.fn(async () => 'x')
    await expect(guardAction(['ADMIN'], null, fn)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(fn).not.toHaveBeenCalled()
  })

  it('con el rol correcto ejecuta y expone actorId real', async () => {
    const fn = vi.fn(async (ctx: { actorId: string }) => ctx.actorId)
    const out = await guardAction(['ADMIN'], sessionOf('ADMIN'), fn)
    expect(out).toBe('u-ADMIN')
    expect(fn).toHaveBeenCalledOnce()
  })

  it('SUPERVISOR no entra a una action de ADMIN', async () => {
    await expect(guardAction(['ADMIN'], sessionOf('SUPERVISOR'), async () => 1)).rejects.toBeInstanceOf(
      ActionError,
    )
  })
})
