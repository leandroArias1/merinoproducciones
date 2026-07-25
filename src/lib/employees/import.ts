import { DateTime } from 'luxon'
import { Prisma } from '@/generated/prisma/client'
import type { PrismaClient } from '@/generated/prisma/client'
import { ActionError } from '@/lib/auth/action'
import type { EmployeeInput } from './schema'
import { DOCUMENT_ID_RE, todayInBA } from './schema'
import { insertEmployeeTx, softDeleteEmployee } from './employees'

type Db = PrismaClient

// Bug #1 (rama import): NO se meten las N filas en una sola transacción gigante
// (>5s sobre el pooler -> timeout -> 0 creados en silencio). Se insertan en
// lotes chicos, cada uno su transacción acotada. La atomicidad "todo o nada" se
// mantiene a nivel USUARIO con rollback compensatorio (ver commitImport).
const IMPORT_CHUNK_SIZE = 10
const IMPORT_TX_TIMEOUT_MS = 20_000

/**
 * Importador CSV de empleados. Dos fases:
 *  - `buildImportPreview`: clasifica cada fila (crear / saltear + motivo) SIN
 *    escribir nada. Es la fuente de verdad del preview.
 *  - `commitImport`: re-valida server-side (nunca confía en el cliente) y crea
 *    las filas válidas en UNA transacción — todo o nada.
 *
 * Los WorkSchedule se generan desde la plantilla de la categoría reusando
 * `insertEmployeeTx` (misma lógica que el alta manual, sin duplicar).
 */

// ── Parser CSV ──────────────────────────────────────────────────────────────

/** Detecta separador (',' o ';') mirando la primera línea. */
function detectDelimiter(firstLine: string): string {
  const commas = (firstLine.match(/,/g) ?? []).length
  const semis = (firstLine.match(/;/g) ?? []).length
  return semis > commas ? ';' : ','
}

export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '') // saca BOM de Excel
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? ''
  const delim = detectDelimiter(firstLine)

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === delim) {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (c === '\r') {
      /* ignore */
    } else field += c
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  // descarta líneas totalmente vacías
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

// ── Cabeceras ─────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

type Field = 'firstName' | 'lastName' | 'documentId' | 'phone' | 'position' | 'category' | 'hireDate'

const HEADER_SYNONYMS: Record<string, Field> = {
  nombre: 'firstName',
  apellido: 'lastName',
  dni: 'documentId',
  documento: 'documentId',
  documentid: 'documentId',
  cuil: 'documentId',
  telefono: 'phone',
  tel: 'phone',
  celular: 'phone',
  cargo: 'position',
  puesto: 'position',
  categoria: 'category',
  'fecha de ingreso': 'hireDate',
  ingreso: 'hireDate',
  fecha: 'hireDate',
}

const REQUIRED: Field[] = ['firstName', 'lastName', 'documentId']

// ── Fechas ──────────────────────────────────────────────────────────────────

/** Devuelve 'YYYY-MM-DD' | '' si vacío | null si inválida. */
function parseHireDate(raw: string): string | null {
  const s = raw.trim()
  if (!s) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return DateTime.fromISO(s).isValid ? s : null
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const d = DateTime.fromFormat(s, 'd/M/yyyy')
    return d.isValid ? (d.toISODate() as string) : null
  }
  return null
}

// ── Clasificación ─────────────────────────────────────────────────────────

export type RowStatus = 'create' | 'skip'

export interface ImportRowResult {
  rowNumber: number // 1-based (fila de datos, sin contar la cabecera)
  values: Record<Field, string>
  status: RowStatus
  reason?: string
}

export interface ImportPreview {
  headerError?: string
  rows: ImportRowResult[]
  toCreate: number
  toSkip: number
}

interface Classified extends ImportRowResult {
  input?: EmployeeInput // presente solo en filas 'create'
}

async function classify(db: Db, csvText: string): Promise<{ headerError?: string; rows: Classified[] }> {
  const cells = parseCsv(csvText)
  if (cells.length === 0) return { headerError: 'El archivo está vacío.', rows: [] }

  // Cabecera → índice de cada campo.
  const header = cells[0].map((h) => HEADER_SYNONYMS[norm(h)])
  const colOf = (f: Field) => header.indexOf(f)
  const missing = REQUIRED.filter((f) => colOf(f) === -1)
  if (missing.length > 0) {
    const nice = { firstName: 'nombre', lastName: 'apellido', documentId: 'DNI' }
    return { headerError: `Faltan columnas obligatorias: ${missing.map((m) => nice[m as keyof typeof nice]).join(', ')}.`, rows: [] }
  }

  const dataRows = cells.slice(1)
  const get = (row: string[], f: Field) => (colOf(f) >= 0 ? (row[colOf(f)] ?? '').trim() : '')

  // Datos de contexto (una query cada uno: sin N+1).
  const dnis = dataRows.map((r) => get(r, 'documentId')).filter(Boolean)
  const [categories, existing] = await Promise.all([
    db.employeeCategory.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
    dnis.length
      ? db.employee.findMany({ where: { documentId: { in: dnis }, deletedAt: null }, select: { documentId: true } })
      : Promise.resolve([]),
  ])
  const catByName = new Map(categories.map((c) => [norm(c.name), c.id]))
  const takenDni = new Set(existing.map((e) => e.documentId))
  const seenInFile = new Set<string>()

  const rows: Classified[] = dataRows.map((row, i) => {
    const values: Record<Field, string> = {
      firstName: get(row, 'firstName'),
      lastName: get(row, 'lastName'),
      documentId: get(row, 'documentId'),
      phone: get(row, 'phone'),
      position: get(row, 'position'),
      category: get(row, 'category'),
      hireDate: get(row, 'hireDate'),
    }
    const base = { rowNumber: i + 1, values }
    const skip = (reason: string): Classified => ({ ...base, status: 'skip', reason })

    if (!values.firstName || !values.lastName || !values.documentId) {
      return skip('Faltan campos obligatorios (nombre, apellido o DNI).')
    }
    // DNI: mismas reglas que el alta manual (numérico, 7-8 dígitos).
    if (!DOCUMENT_ID_RE.test(values.documentId)) {
      return skip(`DNI inválido (debe ser numérico de 7 u 8 dígitos): "${values.documentId}".`)
    }
    // Categoría: vacía = sin categoría; con nombre = tiene que existir.
    let categoryId = ''
    if (values.category) {
      const found = catByName.get(norm(values.category))
      if (!found) return skip(`Categoría inexistente: "${values.category}".`)
      categoryId = found
    }
    const hireDate = parseHireDate(values.hireDate)
    if (hireDate === null) return skip(`Fecha de ingreso inválida: "${values.hireDate}".`)
    if (hireDate !== '' && hireDate > todayInBA()) return skip(`Fecha de ingreso futura: "${values.hireDate}".`)

    if (takenDni.has(values.documentId)) return skip(`DNI ya registrado en un empleado activo: ${values.documentId}.`)
    if (seenInFile.has(values.documentId)) return skip(`DNI repetido dentro del archivo: ${values.documentId}.`)
    seenInFile.add(values.documentId)

    const input: EmployeeInput = {
      firstName: values.firstName,
      lastName: values.lastName,
      documentId: values.documentId,
      email: '',
      phone: values.phone,
      position: values.position,
      employmentType: 'MONTHLY', // el CSV no trae tipo → default
      hireDate,
      categoryId,
      active: true,
    }
    return { ...base, status: 'create', input }
  })

  return { rows }
}

export async function buildImportPreview(db: Db, csvText: string): Promise<ImportPreview> {
  const { headerError, rows } = await classify(db, csvText)
  const publicRows: ImportRowResult[] = rows.map(({ rowNumber, values, status, reason }) => ({ rowNumber, values, status, reason }))
  return {
    headerError,
    rows: publicRows,
    toCreate: publicRows.filter((r) => r.status === 'create').length,
    toSkip: publicRows.filter((r) => r.status === 'skip').length,
  }
}

export interface ImportResult {
  created: number
  skipped: number
}

/**
 * Rollback compensatorio de un import que falló a mitad: soft-deletea (regla del
 * proyecto: nunca hard delete) los empleados YA commiteados de lotes previos.
 * Devuelve los IDs que NO se pudieron revertir (para avisar, nunca en silencio).
 */
async function rollbackImport(db: Db, ids: string[], actorId: string): Promise<string[]> {
  const failed: string[] = []
  for (const id of ids) {
    try {
      await softDeleteEmployee(db, id, actorId)
    } catch {
      failed.push(id)
    }
  }
  return failed
}

/**
 * Crea las filas válidas en LOTES CHICOS (no una transacción gigante: era el
 * bug #1). Semántica "todo o nada" a nivel usuario: si un lote falla, se revierte
 * TODO lo ya insertado y se lanza un error CLARO — nunca un fallo silencioso.
 * Auditado.
 */
export async function commitImport(db: Db, csvText: string, actorId: string): Promise<ImportResult> {
  const { headerError, rows } = await classify(db, csvText)
  if (headerError) throw new ActionError('VALIDATION', headerError)

  const toCreate = rows.filter((r) => r.status === 'create' && r.input)
  if (toCreate.length === 0) throw new ActionError('VALIDATION', 'No hay filas válidas para importar.')

  const committedIds: string[] = []
  try {
    for (let i = 0; i < toCreate.length; i += IMPORT_CHUNK_SIZE) {
      const chunk = toCreate.slice(i, i + IMPORT_CHUNK_SIZE)
      // Los IDs del lote se juntan aparte y solo se dan por buenos DESPUÉS del
      // commit: si el lote falla, su transacción revierte y estos se descartan.
      const chunkIds: string[] = []
      await db.$transaction(
        async (tx) => {
          for (const row of chunk) {
            const input = row.input as EmployeeInput
            const id = await insertEmployeeTx(tx, input, actorId)
            await tx.auditLog.create({
              data: {
                domain: 'EMPLOYEE',
                action: 'import',
                entityType: 'Employee',
                entityId: id,
                before: Prisma.DbNull,
                after: { source: 'csv-import', documentId: input.documentId } as Prisma.InputJsonValue,
                actorId,
              },
            })
            chunkIds.push(id)
          }
        },
        { maxWait: IMPORT_TX_TIMEOUT_MS, timeout: IMPORT_TX_TIMEOUT_MS },
      )
      committedIds.push(...chunkIds)
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    const failed = await rollbackImport(db, committedIds, actorId)
    if (failed.length > 0) {
      throw new ActionError(
        'CONFLICT',
        `La importación falló y NO se pudo revertir por completo. ` +
          `Quedaron ${failed.length} empleado(s) para limpiar a mano (IDs: ${failed.join(', ')}). ` +
          `Error original: ${detail}`,
      )
    }
    throw new ActionError(
      'CONFLICT',
      `La importación falló y se revirtió por completo (0 empleados creados). ` +
        `Revisá el CSV y reintentá. Detalle: ${detail}`,
    )
  }

  return { created: toCreate.length, skipped: rows.length - toCreate.length }
}
