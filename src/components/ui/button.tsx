import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground hover:opacity-90 active:opacity-80 active:scale-[0.99]',
        secondary:
          'border border-[var(--border)] bg-background text-foreground hover:bg-secondary',
        ghost: 'text-muted-foreground hover:bg-secondary hover:text-foreground',
        destructive:
          'bg-destructive text-destructive-foreground hover:opacity-90 active:opacity-80',
      },
      size: {
        sm: 'h-8 px-3',
        md: 'h-9 px-4',
        lg: 'h-11 px-6 text-base',
        xl: 'h-24 px-8 text-2xl font-semibold', // fichaje del empleado (6 AM, sol de frente)
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

/** Rueda del estado "guardando". `.spinner` respeta prefers-reduced-motion. */
function Spinner() {
  return (
    <span
      aria-hidden
      className="spinner size-3.5 shrink-0 rounded-full border-2 border-current/30 border-t-current"
    />
  )
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * Acción en curso: deshabilita, muestra la rueda y reemplaza el texto por
   * `loadingText`. En este sistema una mutación tarda ~3 s contra Supabase;
   * sin este estado el silencio se lee como "se colgó" y el usuario vuelve a
   * apretar. Anunciado con aria-busy para lectores de pantalla.
   */
  loading?: boolean
  /** Texto mientras carga. Por defecto "Guardando…". */
  loadingText?: string
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading = false, loadingText = 'Guardando…', disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <Spinner />
          {loadingText}
        </>
      ) : (
        children
      )}
    </button>
  ),
)
Button.displayName = 'Button'

export { buttonVariants }
