'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ShieldOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SelectConOtra } from '@/components/ui/select-con-otra'
import {
  employeeSchema,
  type EmployeeFormValues,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
} from '@/lib/employees/schema'
import type { AppRole } from '@/lib/auth/access'
import type { EmployeeAccess } from '@/lib/users/access'
import { createEmployeeAction, updateEmployeeAction, setUserRoleAction } from '~/app/admin/empleados/actions'

const inputCls = 'h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-primary'

const ROLE_LABELS: Record<AppRole, string> = {
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  EMPLOYEE: 'Empleado',
}
const ROLES: AppRole[] = ['ADMIN', 'SUPERVISOR', 'EMPLOYEE']

/**
 * Cargos habituales. Vive acá y no en `src/lib/employees/schema.ts` a propósito:
 * el schema sigue aceptando texto libre (hay legajos viejos con el cargo escrito
 * a mano y está la opción "Otra…"). Esto es sólo qué se ofrece en la pantalla.
 */
const CARGOS = ['Luces', 'Sonido', 'Pantalla', 'Transporte'] as const

export interface EmployeeInitial extends EmployeeFormValues {
  id: string
}

/**
 * Alta y edición de empleado.
 *
 * El ROL no es un campo del empleado: vive en su cuenta de acceso (`User`), y
 * un empleado puede no tener cuenta todavía. Por eso el rol NO entra al
 * `employeeSchema` ni viaja con `updateEmployeeAction`: se muestra acá por
 * comodidad —están todos los datos juntos— pero se guarda con la MISMA action
 * que usa el panel de "Acceso a la app" del legajo (`setUserRoleAction`), y
 * solo si el usuario efectivamente lo cambió.
 *
 * Sin cuenta de acceso no se dibuja el desplegable: un select que no guarda
 * nada es peor que no tenerlo.
 */
export function EmployeeForm({
  categories,
  initial,
  access,
}: {
  categories: { id: string; name: string }[]
  initial?: EmployeeInitial
  /** Estado de acceso del empleado. Solo en edición; en el alta todavía no existe. */
  access?: EmployeeAccess
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const roleInicial: AppRole = access?.role ?? 'EMPLOYEE'
  const [role, setRole] = useState<AppRole>(roleInicial)
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema), // MISMO schema que el servidor
    defaultValues: initial ?? {
      firstName: '',
      lastName: '',
      documentId: '',
      email: '',
      phone: '',
      position: '',
      employmentType: 'MONTHLY',
      hireDate: '',
      categoryId: '',
      active: true,
    },
  })

  // El cargo se elige de una lista (ver SelectConOtra): "Sonido" siempre es
  // "Sonido" y no "sonido", que quedaban como cargos distintos en los listados.
  const position = watch('position') ?? ''

  function onSubmit(values: EmployeeFormValues) {
    setError(null)
    startTransition(async () => {
      const res = initial
        ? await updateEmployeeAction(initial.id, values)
        : await createEmployeeAction(values)
      if (!res.ok) {
        setError(res.error)
        return
      }

      // El rol va en una operación aparte porque es otra entidad. Solo si
      // cambió: si no, cada "Guardar cambios" escribiría un AuditLog de un
      // cambio de rol que nunca ocurrió.
      if (initial && access?.active && role !== roleInicial) {
        const rol = await setUserRoleAction(initial.id, role)
        if (!rol.ok) {
          // Los datos YA se guardaron: decirlo, y no navegar, para que el
          // usuario pueda reintentar el rol sin perder de vista qué falló.
          setError(`Se guardaron los datos del empleado, pero el rol no se pudo cambiar: ${rol.error}`)
          return
        }
      }

      router.push(initial ? `/admin/empleados/${initial.id}` : '/admin/empleados')
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" error={errors.firstName?.message}>
          <input {...register('firstName')} className={inputCls} />
        </Field>
        <Field label="Apellido" error={errors.lastName?.message}>
          <input {...register('lastName')} className={inputCls} />
        </Field>
        <Field label="Documento (DNI/CUIL)" error={errors.documentId?.message}>
          <input {...register('documentId')} className={inputCls} />
        </Field>
        <Field label="Cargo" error={errors.position?.message} htmlFor="cargo">
          <SelectConOtra
            id="cargo"
            className={inputCls}
            opciones={CARGOS}
            value={position}
            onChange={(v) => setValue('position', v)}
            vacioLabel="Sin cargo"
            placeholder="Escribí el cargo"
            textoAriaLabel="Cargo personalizado"
          />
        </Field>
        <Field label="Email" error={errors.email?.message}>
          <input {...register('email')} className={inputCls} type="email" />
        </Field>
        <Field label="Teléfono" error={errors.phone?.message}>
          <input {...register('phone')} className={inputCls} />
        </Field>
        <Field label="Contratación" error={errors.employmentType?.message}>
          <select {...register('employmentType')} className={inputCls}>
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EMPLOYMENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fecha de ingreso" error={errors.hireDate?.message}>
          <input {...register('hireDate')} className={inputCls} type="date" />
        </Field>
        <Field label="Categoría" error={errors.categoryId?.message}>
          <select {...register('categoryId')} className={inputCls}>
            <option value="">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" {...register('active')} className="size-4 accent-primary" />
          Activo
        </label>
      </div>

      {initial && access && (
        <div className="space-y-2 border-t pt-4">
          <h2 className="text-sm font-medium">Acceso a la app</h2>
          {access.active ? (
            <>
              <div className="max-w-xs">
                <label className="text-sm font-medium" htmlFor="rol">
                  Rol
                </label>
                <select
                  id="rol"
                  className={`${inputCls} mt-1.5`}
                  value={role}
                  disabled={pending}
                  onChange={(e) => setRole(e.target.value as AppRole)}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                Se guarda junto con el resto de los datos. Define qué pantallas ve{' '}
                {access.email ? <span className="font-medium">{access.email}</span> : 'esta persona'} al entrar.
              </p>
            </>
          ) : (
            // Sin cuenta (o con el acceso desactivado) no hay rol que cambiar:
            // en vez de un desplegable fantasma, el camino para arreglarlo.
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border bg-secondary/40 px-3 py-2.5 text-sm">
              <ShieldOff className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                {access.hasUser
                  ? 'Este empleado tiene el acceso a la app desactivado, así que no tiene rol.'
                  : 'Este empleado todavía no tiene acceso a la app, así que no tiene rol.'}
              </span>
              <Link href={`/admin/empleados/${initial.id}#acceso`} className="font-medium text-primary hover:underline">
                {access.hasUser ? 'Volver a habilitarlo' : 'Crear el acceso'}
              </Link>
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : initial ? 'Guardar cambios' : 'Crear empleado'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}

function Field({ label, error, children, htmlFor }: { label: string; error?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
