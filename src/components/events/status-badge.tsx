import { cn } from '@/lib/utils'

type Tone = 'muted' | 'neutral' | 'accent' | 'success' | 'danger'

const TONES: Record<Tone, string> = {
  muted: 'border-[var(--border)] text-muted-foreground',
  neutral: 'border-[var(--border-strong,#d4d4d8)] text-foreground',
  accent: 'border-primary/30 text-primary',
  success: 'border-transparent text-[var(--success)] bg-[color-mix(in_oklch,var(--success)_10%,transparent)]',
  danger: 'border-transparent text-destructive bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)]',
}

export function StatusBadge({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        TONES[tone],
      )}
    >
      {label}
    </span>
  )
}

export function eventTone(status: string): Tone {
  return status === 'IN_PROGRESS'
    ? 'accent'
    : status === 'COMPLETED'
      ? 'success'
      : status === 'CANCELLED'
        ? 'danger'
        : status === 'CONFIRMED'
          ? 'neutral'
          : 'muted'
}

export function assignmentTone(status: string): Tone {
  return status === 'COMPLETED'
    ? 'success'
    : status === 'CANCELLED'
      ? 'danger'
      : status === 'CONFIRMED'
        ? 'neutral'
        : 'muted'
}
