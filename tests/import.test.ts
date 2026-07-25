import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { prisma } from '@/lib/db'
import type { PrismaClient } from '@/generated/prisma/client'
import { buildImportPreview, commitImport, parseCsv } from '@/lib/employees/import'
import { createCategory } from '@/lib/employees/categories'
import { createEmployee } from '@/lib/employees/employees'
import { dowBA } from '@/lib/attendance'

const ACTOR = 'admin-user-id'

async function clean() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "user", account, session, employee_category, category_day, employee, work_schedule, attendance, audit_log, event_assignment, time_entry, leave_request, event, holiday RESTART IDENTITY CASCADE',
  )
}

beforeEach(async () => {
  await clean()
  await prisma.user.create({ data: { id: ACTOR, email: 'a@t.com', name: 'A', role: 'ADMIN' } })
})
afterAll(async () => {
  await prisma.$disconnect()
})

// CSV con filas válidas e inválidas mezcladas.
function mixedCsv() {
  return [
    'nombre,apellido,DNI,telefono,cargo,categoria,fecha de ingreso',
    'Ana,Pérez,40111222,11-5555,Sonido,Jornada completa,2026-03-01', // válida
    'Beto,Gómez,40222333,,Montaje,Categoría Fantasma,2026-03-01', // categoría inexistente
    'Caro,Díaz,40333444,,Luces,Jornada completa,31/31/2026', // fecha inválida
    'Dani,López,30000001,,Vestuario,Jornada completa,', // DNI ya registrado (activo)
    'Emi,Ruiz,40555666,,Backline,,2026-03-01', // válida (sin categoría)
    'Emi2,Ruiz,40555666,,Backline,,2026-03-01', // DNI repetido en el archivo
    'Faltante,,40777888,,,,', // faltan campos (apellido)
  ].join('\n')
}

describe('importador CSV', () => {
  it('parser básico respeta comillas y comas internas', () => {
    const rows = parseCsv('a,b\n"con, coma",x')
    expect(rows[1]).toEqual(['con, coma', 'x'])
  })

  it('el preview clasifica bien y NO escribe nada', async () => {
    await createCategory(prisma, {
      name: 'Jornada completa',
      description: '',
      days: [{ dayOfWeek: dowBA('2026-03-02'), startMinute: 540, endMinute: 1020 }],
    })
    // Empleado activo con el DNI 30000001 (para el caso "ya registrado").
    await createEmployee(
      prisma,
      { firstName: 'X', lastName: 'Y', documentId: '30000001', email: '', phone: '', position: '', employmentType: 'MONTHLY', hireDate: '', categoryId: '', active: true },
      ACTOR,
    )
    const antes = await prisma.employee.count({ where: { deletedAt: null } })

    const preview = await buildImportPreview(prisma, mixedCsv())

    expect(preview.headerError).toBeUndefined()
    // De 7 filas de datos: 2 crear (Ana + Emi), 5 saltear.
    expect(preview.toCreate).toBe(2)
    expect(preview.toSkip).toBe(5)
    expect(preview.rows).toHaveLength(7)
    expect(preview.rows.filter((r) => r.status === 'skip')).toHaveLength(5)

    const byReason = preview.rows.filter((r) => r.status === 'skip').map((r) => r.reason ?? '')
    expect(byReason.some((r) => /Categoría inexistente/.test(r))).toBe(true)
    expect(byReason.some((r) => /Fecha de ingreso inválida/.test(r))).toBe(true)
    expect(byReason.some((r) => /ya registrado/.test(r))).toBe(true)
    expect(byReason.some((r) => /repetido dentro del archivo/.test(r))).toBe(true)
    expect(byReason.some((r) => /Faltan campos/.test(r))).toBe(true)

    // NADA se escribió durante el preview.
    const despues = await prisma.employee.count({ where: { deletedAt: null } })
    expect(despues).toBe(antes)
  })

  it('commit crea solo las válidas, en una transacción, con horarios y auditoría', async () => {
    const catId = await createCategory(prisma, {
      name: 'Jornada completa',
      description: '',
      days: [{ dayOfWeek: 1, startMinute: 540, endMinute: 1020 }],
    })
    await createEmployee(
      prisma,
      { firstName: 'X', lastName: 'Y', documentId: '30000001', email: '', phone: '', position: '', employmentType: 'MONTHLY', hireDate: '', categoryId: '', active: true },
      ACTOR,
    )

    const res = await commitImport(prisma, mixedCsv(), ACTOR)
    expect(res.created).toBe(2)
    expect(res.skipped).toBe(5)

    // Ana quedó con categoría → tiene WorkSchedule generado.
    const ana = await prisma.employee.findFirstOrThrow({ where: { documentId: '40111222', deletedAt: null }, select: { id: true, categoryId: true } })
    expect(ana.categoryId).toBe(catId)
    const sched = await prisma.workSchedule.count({ where: { employeeId: ana.id, deletedAt: null } })
    expect(sched).toBeGreaterThan(0)

    // Auditoría de importación.
    const audits = await prisma.auditLog.count({ where: { domain: 'EMPLOYEE', action: 'import' } })
    expect(audits).toBe(2)

    // Las inválidas no se crearon.
    expect(await prisma.employee.count({ where: { documentId: '40222333', deletedAt: null } })).toBe(0)
  })

  it('cabecera sin columnas obligatorias → headerError, sin filas', async () => {
    const preview = await buildImportPreview(prisma, 'foo,bar\n1,2')
    expect(preview.headerError).toMatch(/Faltan columnas obligatorias/)
    expect(preview.rows).toHaveLength(0)
  })

  it('aplica las validaciones de DNI (numérico 7-8) y fecha no futura del alta manual', async () => {
    const csv = [
      'nombre,apellido,DNI,telefono,cargo,categoria,fecha de ingreso',
      'Leti,Ras,ABC12345,,Cargo,,2026-03-01', // DNI con letras -> skip
      'Cor,Ta,123456,,Cargo,,2026-03-01', // DNI de 6 dígitos -> skip
      'Fu,Turo,40999888,,Cargo,,2999-01-01', // fecha futura -> skip
      'Ok,Persona,40111000,,Cargo,,2026-03-01', // válida
    ].join('\n')
    const preview = await buildImportPreview(prisma, csv)
    expect(preview.toCreate).toBe(1)
    const reasons = preview.rows.filter((r) => r.status === 'skip').map((r) => r.reason ?? '')
    expect(reasons.some((r) => /DNI inválido/.test(r))).toBe(true)
    expect(reasons.some((r) => /futura/.test(r))).toBe(true)
  })
})

// ── Bug #1 (rama import): lotes + todo-o-nada + error no silencioso ──

/** N filas válidas; si `boomAt` se setea, esa fila lleva firstName 'BOOM'. */
function validCsv(n: number, boomAt?: number): string {
  const lines = ['nombre,apellido,DNI,telefono,cargo,categoria,fecha de ingreso']
  for (let i = 1; i <= n; i++) {
    const first = boomAt === i ? 'BOOM' : `Nom${i}`
    lines.push(`${first},Ape${i},${40000000 + i},,Cargo,,2026-03-01`)
  }
  return lines.join('\n')
}

describe('importador CSV — volumen y atomicidad (bug #1)', () => {
  it('30 filas válidas se crean todas (varios lotes, ninguna se pierde)', async () => {
    const res = await commitImport(prisma, validCsv(30), ACTOR)
    expect(res.created).toBe(30)
    expect(await prisma.employee.count({ where: { deletedAt: null } })).toBe(30)
  })

  it('si una fila del medio rompe en el insert → NO queda a medio importar y el error se propaga', async () => {
    // Extensión que simula un fallo de DB al crear la fila 'BOOM' (pasa el
    // preview pero revienta en el insert, después de que un lote previo commiteó).
    const boomDb = prisma.$extends({
      query: {
        employee: {
          async create({ args, query }) {
            if ((args.data as { firstName?: string }).firstName === 'BOOM') {
              throw new Error('fallo simulado en insert')
            }
            return query(args)
          },
        },
      },
    }) as unknown as PrismaClient

    // Fila 15 rompe → el lote 1 (1-10) ya commiteó y debe revertirse.
    await expect(commitImport(boomDb, validCsv(30, 15), ACTOR)).rejects.toThrow(/revirtió por completo/)

    // Todo o nada: no queda NINGÚN empleado activo.
    expect(await prisma.employee.count({ where: { deletedAt: null } })).toBe(0)
  })
})
