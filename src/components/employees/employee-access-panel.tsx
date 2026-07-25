'use client'

import { useState, useTransition } from 'react'
import { KeyRound, ShieldCheck, ShieldOff, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmButton } from '@/components/ui/confirm-dialog'
import type { AppRole } from '@/lib/auth/access'
import type { EmployeeAccess } from '@/lib/users/access'
import {
  grantAccessAction,
  setUserRoleAction,
  resetPasswordAction,
  disableAccessAction,
} from '~/app/admin/empleados/actions'

const ROLE_LABELS: Record<AppRole, string> = {
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  EMPLOYEE: 'Empleado',
}
const ROLES: AppRole[] = ['ADMIN', 'SUPERVISOR', 'EMPLOYEE']

const inputCls = 'h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-primary'

/** Password temporal legible (sin ambiguos), generada en el cliente. */
function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = new Uint32Array(14)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export function EmployeeAccessPanel({
  employeeId,
  employeeEmail,
  access,
}: {
  employeeId: string
  employeeEmail: string | null
  access: EmployeeAccess
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Contraseña recién definida/generada: se muestra UNA vez tras el éxito.
  const [shownPassword, setShownPassword] = useState<string | null>(null)

  // Form de alta / re-habilitación.
  const [showGrant, setShowGrant] = useState(false)
  const [email, setEmail] = useState(employeeEmail ?? '')
  const [grantPw, setGrantPw] = useState('')
  const [role, setRole] = useState<AppRole>('EMPLOYEE')

  // Form de reset.
  const [showReset, setShowReset] = useState(false)
  const [resetPw, setResetPw] = useState('')

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) return setError(res.error ?? 'Error.')
      onOk?.()
    })
  }

  function doGrant() {
    const pw = grantPw
    run(
      () => grantAccessAction(employeeId, email, pw, role),
      () => {
        setShowGrant(false)
        setShownPassword(pw)
        setGrantPw('')
      },
    )
  }

  function doReset() {
    const pw = resetPw
    run(
      () => resetPasswordAction(employeeId, pw),
      () => {
        setShowReset(false)
        setShownPassword(pw)
        setResetPw('')
      },
    )
  }

  return (
    <div className="max-w-md">
      <div className="mb-2 flex items-center gap-2">
        <KeyRound className="size-4 text-muted-foreground" />
        <p className="text-sm font-medium">Acceso a la app</p>
      </div>

      {shownPassword && (
        <div className="mb-3 rounded-lg border border-[var(--success)]/40 bg-[var(--success)]/5 px-4 py-3 text-sm">
          <p className="font-medium">Contraseña definida. Copiala ahora — no se vuelve a mostrar.</p>
          <code className="mt-1 block select-all break-all rounded bg-background px-2 py-1 font-mono text-xs">
            {shownPassword}
          </code>
          <button className="mt-2 text-xs text-muted-foreground underline" onClick={() => setShownPassword(null)}>
            Ocultar
          </button>
        </div>
      )}

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {access.active ? (
        // ── Tiene acceso: rol + reset + desactivar ──
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck className="size-4 text-[var(--success)]" />
            <span className="font-medium">{access.email}</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Rol</label>
            <select
              className="h-8 rounded-md border bg-background px-2 text-sm"
              value={access.role ?? 'EMPLOYEE'}
              disabled={pending}
              onChange={(e) => run(() => setUserRoleAction(employeeId, e.target.value))}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>

          {showReset ? (
            <div className="flex flex-wrap items-end gap-2 rounded-md bg-secondary p-3">
              <div className="flex-1">
                <label className="block text-xs text-muted-foreground">Nueva contraseña</label>
                <input className={inputCls} value={resetPw} onChange={(e) => setResetPw(e.target.value)} />
              </div>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => setResetPw(generatePassword())}>
                Generar
              </Button>
              <Button size="sm" disabled={pending || resetPw.length < 8} onClick={doReset}>
                Guardar
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => setShowReset(true)}>
                <RefreshCw /> Restablecer contraseña
              </Button>
              <ConfirmButton
                size="sm"
                variant="ghost"
                title="¿Desactivar el acceso?"
                description="No va a poder entrar más a la app hasta que le crees un acceso nuevo. El usuario NO se borra: se conserva para no perder el rastro de quién hizo cada cambio."
                confirmLabel="Sí, desactivar"
                onConfirm={() => disableAccessAction(employeeId)}
              >
                <ShieldOff /> Desactivar acceso
              </ConfirmButton>
            </div>
          )}
        </div>
      ) : showGrant ? (
        // ── Form de alta / re-habilitación ──
        <div className="space-y-3 rounded-lg border p-4">
          {access.hasUser && (
            <p className="text-xs text-muted-foreground">
              Este empleado ya tenía un usuario (acceso desactivado). Se le va a recrear la credencial.
            </p>
          )}
          {!access.hasUser && (
            <div>
              <label className="block text-xs text-muted-foreground">Email</label>
              <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="persona@empresa.com" />
            </div>
          )}
          <div>
            <label className="block text-xs text-muted-foreground">Contraseña inicial</label>
            <div className="flex gap-2">
              <input className={inputCls} value={grantPw} onChange={(e) => setGrantPw(e.target.value)} />
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => setGrantPw(generatePassword())}>
                Generar
              </Button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground">Rol</label>
            <select className={inputCls} value={role} disabled={pending} onChange={(e) => setRole(e.target.value as AppRole)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={pending || grantPw.length < 8 || (!access.hasUser && !email)} onClick={doGrant}>
              Crear acceso
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setShowGrant(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        // ── Sin acceso ──
        <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-4">
          <span className="text-sm text-muted-foreground">
            {access.hasUser ? 'Acceso desactivado.' : 'Este empleado no tiene acceso a la app.'}
          </span>
          <Button size="sm" disabled={pending} onClick={() => setShowGrant(true)}>
            <ShieldCheck /> Crear acceso
          </Button>
        </div>
      )}
    </div>
  )
}
