import { EventForm } from '@/components/events/event-form'

export default function NuevoEventoPage() {
  return (
    <div>
      <header className="mb-6 border-b pb-4">
        <h1 className="text-xl font-semibold tracking-tight">Nuevo evento</h1>
        <p className="mt-1 text-sm text-muted-foreground">Se crea en estado borrador.</p>
      </header>
      <EventForm />
    </div>
  )
}
