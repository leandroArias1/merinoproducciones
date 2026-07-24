import type { Tx } from '@/lib/attendance/persist'

/**
 * Versionado de WorkSchedule al asignar o CAMBIAR la categoría de un empleado.
 *
 * NO se pisan los horarios: los vigentes se cierran con effectiveTo = día
 * anterior al cambio, y se generan nuevos desde la plantilla de la categoría
 * nueva con effectiveFrom = día del cambio.
 *
 * Motivo: si se sobrescribiera, el barrido de asistencia recalcularía meses
 * pasados con el horario nuevo y reescribiría el historial.
 */

const MS_DAY = 86_400_000

function addDaysUtc(d: Date, days: number): Date {
  // Los workDate son @db.Date (medianoche UTC): sumar días en ms es seguro.
  return new Date(d.getTime() + days * MS_DAY)
}

export async function versionSchedules(
  tx: Tx,
  args: { employeeId: string; newCategoryId: string | null; effectiveDate: Date },
): Promise<void> {
  const { employeeId, newCategoryId, effectiveDate } = args
  const dayBefore = addDaysUtc(effectiveDate, -1)

  // Cerrar las vigentes que empezaron ANTES del cambio: effectiveTo = ayer.
  await tx.workSchedule.updateMany({
    where: { employeeId, deletedAt: null, effectiveTo: null, effectiveFrom: { lt: effectiveDate } },
    data: { effectiveTo: dayBefore },
  })

  // Las creadas el MISMO día (o después) que se reemplazan nunca llegaron a
  // aplicar: se descartan por soft delete (además evita effectiveTo < from,
  // que violaría el CHECK del schema).
  await tx.workSchedule.updateMany({
    where: { employeeId, deletedAt: null, effectiveTo: null, effectiveFrom: { gte: effectiveDate } },
    data: { deletedAt: new Date() },
  })

  if (!newCategoryId) return

  const days = await tx.categoryDay.findMany({
    where: { categoryId: newCategoryId, deletedAt: null },
    select: { dayOfWeek: true, startMinute: true, endMinute: true },
  })
  if (days.length === 0) return

  await tx.workSchedule.createMany({
    data: days.map((d) => ({
      employeeId,
      dayOfWeek: d.dayOfWeek,
      startMinute: d.startMinute,
      endMinute: d.endMinute,
      isException: false,
      effectiveFrom: effectiveDate,
      effectiveTo: null,
    })),
  })
}
