'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await authClient.signIn.email({ email, password })

    if (error) {
      // Solo acá se apaga: el formulario vuelve a estar usable para reintentar.
      setLoading(false)
      setError('Email o contraseña incorrectos.')
      return
    }

    // ÉXITO: el estado de carga NO se apaga a propósito.
    //
    // Validar la contraseña es lo rápido; lo que tarda es lo que viene después
    // —resolver el rol y renderizar el shell entero—, y son varios segundos.
    // Apagarlo acá dejaba el botón otra vez en "Ingresar" y habilitado durante
    // toda esa espera, con la pantalla sin cambiar: se leía como colgado y el
    // usuario volvía a apretar, disparando un segundo login.
    //
    // Queda encendido hasta que la navegación reemplaza esta pantalla.
    router.push('/')
    router.refresh()
  }

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-secondary px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Merino Producciones</p>
          <h1 className="mt-1 text-xl font-semibold text-foreground">Ingresá a tu cuenta</h1>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-lg border bg-card p-6">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium text-foreground">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium text-foreground">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-primary"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          {/* Mismo estado que los formularios de plata: rueda + texto + aria-busy,
              y deshabilitado para que no se pueda apretar dos veces. */}
          <Button type="submit" size="md" className="w-full" loading={loading} loadingText="Ingresando…">
            Ingresar
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          ¿No tenés cuenta? Pedísela a un administrador.
        </p>
      </div>
    </main>
  )
}
