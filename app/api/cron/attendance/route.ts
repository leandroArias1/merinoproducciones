import { DateTime } from 'luxon'
import { prisma } from '@/lib/db'
import { sweepAttendance } from '@/lib/attendance'
import { SWEEP_DEFAULTS } from '@/lib/attendance/config'
import { BA_ZONE, workDateFromKey } from '@/lib/attendance/timezone'

// El barrido de la ventana móvil puede tardar; ampliamos el límite de Vercel.
export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * Cron nocturno de asistencia. Recalcula la ventana móvil completa (no "ayer").
 * Protegido con CRON_SECRET: Vercel manda `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Ventana: [hoy - (windowDays-1), hoy] en calendario Buenos Aires.
  const todayKey = DateTime.now().setZone(BA_ZONE).toISODate() as string
  const fromKey = DateTime.now()
    .setZone(BA_ZONE)
    .minus({ days: SWEEP_DEFAULTS.windowDays - 1 })
    .toISODate() as string

  const startedAt = Date.now()
  const summary = await sweepAttendance(prisma, {
    from: workDateFromKey(fromKey),
    to: workDateFromKey(todayKey),
    // Chunk chico A PROPÓSITO (bug #1): cada transacción queda en pocos
    // statements y no revienta el timeout sobre el pooler. Ver config.ts.
    chunkSize: SWEEP_DEFAULTS.cronChunkSize,
    // actorId omitido -> null: lo dispara el sistema, no un usuario.
  })
  const elapsedMs = Date.now() - startedAt

  // `elapsedMs` queda en la respuesta a propósito: es la medición real contra el
  // pooler para decidir si el barrido entra holgado en maxDuration=60 de Vercel.
  return Response.json({ ok: true, elapsedMs, ...summary })
}
