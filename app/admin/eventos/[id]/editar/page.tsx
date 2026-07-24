import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getEvent } from '@/lib/events/events'
import { instantToBaLocal } from '@/lib/events/time'
import { EventForm } from '@/components/events/event-form'

export default async function EditarEventoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const event = await getEvent(prisma, id)
  if (!event) notFound()

  return (
    <div>
      <header className="mb-6 border-b pb-4">
        <h1 className="text-xl font-semibold tracking-tight">Editar evento</h1>
      </header>
      <EventForm
        initial={{
          id: event.id,
          name: event.name,
          client: event.client ?? '',
          venue: event.venue ?? '',
          startAt: instantToBaLocal(event.startAt),
          endAt: instantToBaLocal(event.endAt),
        }}
      />
    </div>
  )
}
