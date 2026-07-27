/**
 * Validación de un solo uso: construye un mes controlado, genera la liquidación
 * por el SISTEMA (closePeriod / generateBajaItem — lo mismo que la UI) e imprime
 * el resultado por empleado para comparar contra la cuenta a mano.
 * Corre contra la base de TEST. DATABASE_URL=... pnpm tsx scripts/validate-payroll.ts
 */
import { prisma } from '@/lib/db'
import { workDateFromKey } from '@/lib/attendance/timezone'
import { closePeriod, generateBajaItem } from '@/lib/payroll/close'

const ACTOR = 'admin-user-id'
const LV = 75_000_000n // 750.000
const LM = 50_000_000n // 500.000
const DED = 3_000_000n // 30.000
const D = (k: string) => workDateFromKey(k)

async function main() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE payroll_line, payroll_item, payroll_period, payroll_config, salary_history, "user", employee_category, category_day, employee, work_schedule, attendance, audit_log, event_assignment, time_entry, leave_request, event, holiday RESTART IDENTITY CASCADE',
  )
  await prisma.user.create({ data: { id: ACTOR, email: 'a@t.com', name: 'A', role: 'ADMIN' } })
  await prisma.payrollConfig.create({ data: { absentDeductionCents: DED, effectiveFrom: D('2026-01-01') } })
  const catLV = await prisma.employeeCategory.create({ data: { name: 'Jornada completa L-V' }, select: { id: true } })
  const catLM = await prisma.employeeCategory.create({ data: { name: 'Media jornada L-M' }, select: { id: true } })

  let dni = 40_100_000
  async function emp(caseId: string, opts: { cat?: string; hire?: string; baja?: string } = {}) {
    dni++
    const e = await prisma.employee.create({
      data: {
        firstName: caseId, lastName: 'Caso', documentId: String(dni),
        categoryId: opts.cat ?? catLV.id, hireDate: D(opts.hire ?? '2026-01-01'),
        // deletedAt es un instante REAL (como new Date() en producción), NO
        // medianoche UTC: un instante de la tarde BA del día de la baja.
        deletedAt: opts.baja ? new Date(`${opts.baja}T14:00:00-03:00`) : null, active: !opts.baja,
      },
      select: { id: true },
    })
    return e.id
  }
  const salary = (employeeId: string, cents: bigint, from = '2026-01-01', to: string | null = null) =>
    prisma.salaryHistory.create({ data: { employeeId, monthlyCents: cents, effectiveFrom: D(from), effectiveTo: to ? D(to) : null } })
  const att = (employeeId: string, key: string, status: string) =>
    prisma.attendance.create({ data: { employeeId, workDate: D(key), status: status as never, source: status === 'JUSTIFIED' ? 'MANUAL' : 'GENERATED', workedMinutes: 0 } })

  // ── SEPTIEMBRE 2026 (30 días) ──
  const e1 = await emp('E1');  await salary(e1, LV)                                   // L-V sin faltas
  const e2 = await emp('E2', { cat: catLM.id }); await salary(e2, LM)                // L-M sin faltas
  const e3 = await emp('E3');  await salary(e3, LV); await att(e3,'2026-09-03','ABSENT'); await att(e3,'2026-09-10','ABSENT') // 2 faltas
  const e4 = await emp('E4');  await salary(e4, LV); await att(e4,'2026-09-03','ABSENT'); await att(e4,'2026-09-10','JUSTIFIED'); await att(e4,'2026-09-17','JUSTIFIED') // 3 faltas, 2 justificadas
  const e5 = await emp('E5', { hire: '2026-09-16' }); await salary(e5, LV)           // ingreso día 16
  const e6 = await emp('E6', { baja: '2026-09-15' }); await salary(e6, LV)           // baja día 15
  const e7 = await emp('E7', { cat: catLM.id }); await salary(e7, LM, '2026-01-01','2026-09-15'); await salary(e7, LV, '2026-09-16', null) // cambio de categoría
  const e8 = await emp('E8');  await salary(e8, LV); for (let d=1; d<=26; d++) await att(e8, `2026-09-${String(d).padStart(2,'0')}`, 'ABSENT') // 26 faltas → piso 0
  const e9 = await emp('E9');  await salary(e9, LV); await att(e9,'2026-09-10','UNVERIFIED') // 1 UNVERIFIED → BLOCKED

  await generateBajaItem(prisma, e6, D('2026-09-15'), ACTOR) // dispara el ítem de baja
  await closePeriod(prisma, 2026, 9, ACTOR)

  // ── OCTUBRE 2026 (31 días) ──
  const o1 = await emp('O1', { hire: '2026-10-16' }); await salary(o1, LV)           // ingreso día 16 (31 días)
  const o2 = await emp('O2', { baja: '2026-10-20' }); await salary(o2, LV)           // baja día 20 (31 días)
  await generateBajaItem(prisma, o2, D('2026-10-20'), ACTOR)
  await closePeriod(prisma, 2026, 10, ACTOR)

  // ── Resultado del SISTEMA ──
  const items = await prisma.payrollItem.findMany({
    where: { deletedAt: null },
    select: { status: true, netCents: true, absentDays: true, employee: { select: { firstName: true } } },
    orderBy: { employee: { firstName: 'asc' } },
  })
  console.log('CASO | faltas(ABSENT) | status | netCents | netPesos')
  for (const i of items) {
    console.log(`${i.employee.firstName} | ${i.absentDays} | ${i.status} | ${i.netCents} | ${(Number(i.netCents) / 100).toLocaleString('es-AR')}`)
  }
}
main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
