import { describe, it, expect } from 'vitest'
import { employeeSchema, todayInBA } from './schema'

const base = {
  firstName: 'A',
  lastName: 'B',
  documentId: '40111222',
  email: '',
  phone: '',
  birthDate: '',
  alias: '',
  position: '',
  employmentType: 'MONTHLY' as const,
  hireDate: '',
  categoryId: '',
  active: true,
}
const parse = (over: Partial<typeof base>) => employeeSchema.safeParse({ ...base, ...over })

describe('employeeSchema.documentId (numérico 7-8)', () => {
  it('acepta 7 y 8 dígitos', () => {
    expect(parse({ documentId: '1234567' }).success).toBe(true)
    expect(parse({ documentId: '12345678' }).success).toBe(true)
  })
  it('rechaza letras', () => {
    expect(parse({ documentId: 'ABC12345' }).success).toBe(false)
    expect(parse({ documentId: '4011122X' }).success).toBe(false)
  })
  it('rechaza 6 o 9 dígitos', () => {
    expect(parse({ documentId: '123456' }).success).toBe(false)
    expect(parse({ documentId: '123456789' }).success).toBe(false)
  })
})

describe('employeeSchema.hireDate (no futura)', () => {
  it('acepta vacía, hoy y pasada', () => {
    expect(parse({ hireDate: '' }).success).toBe(true)
    expect(parse({ hireDate: todayInBA() }).success).toBe(true)
    expect(parse({ hireDate: '2000-01-01' }).success).toBe(true)
  })
  it('rechaza futura', () => {
    expect(parse({ hireDate: '2999-01-01' }).success).toBe(false)
  })
  it('rechaza formato inválido', () => {
    expect(parse({ hireDate: '31/31/2026' }).success).toBe(false)
  })
})

/** 'YYYY-MM-DD' de hace N años, para armar casos de edad relativos a hoy. */
const haceAnios = (n: number) => {
  const hoy = todayInBA()
  return `${Number(hoy.slice(0, 4)) - n}${hoy.slice(4)}`
}

describe('employeeSchema.birthDate (no futura, 16 a 100 años)', () => {
  it('acepta vacía: no todos los legajos la van a tener cargada', () => {
    expect(parse({ birthDate: '' }).success).toBe(true)
  })
  it('acepta una edad normal', () => {
    expect(parse({ birthDate: haceAnios(30) }).success).toBe(true)
  })
  it('acepta los bordes exactos: 16 y 100 años cumplidos hoy', () => {
    expect(parse({ birthDate: haceAnios(16) }).success).toBe(true)
    expect(parse({ birthDate: haceAnios(100) }).success).toBe(true)
  })
  it('rechaza futura', () => {
    const r = parse({ birthDate: '2999-01-01' })
    expect(r.success).toBe(false)
  })
  it('rechaza menor de 16 (edad mínima para trabajar)', () => {
    const r = parse({ birthDate: haceAnios(15) })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].message).toMatch(/16 años/)
  })
  it('rechaza más de 100 años, que siempre es un año mal tipeado', () => {
    const r = parse({ birthDate: haceAnios(101) })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].message).toMatch(/año/)
  })
  it('rechaza formato inválido', () => {
    expect(parse({ birthDate: '31/31/1990' }).success).toBe(false)
  })
})

describe('employeeSchema.alias (alias bancario o CBU)', () => {
  it('acepta vacío: se puede cargar después', () => {
    expect(parse({ alias: '' }).success).toBe(true)
  })
  it('acepta alias con letras, números, punto y guion', () => {
    expect(parse({ alias: 'juan.perez.mp' }).success).toBe(true)
    expect(parse({ alias: 'JUAN-PEREZ-99' }).success).toBe(true)
    expect(parse({ alias: 'abcdef' }).success).toBe(true) // 6, el mínimo
    expect(parse({ alias: 'a'.repeat(20) }).success).toBe(true) // 20, el máximo
  })
  it('acepta un CBU/CVU de 22 dígitos pelado', () => {
    expect(parse({ alias: '0000003100010000000001' }).success).toBe(true)
  })
  it('rechaza demasiado corto o demasiado largo', () => {
    expect(parse({ alias: 'abcde' }).success).toBe(false) // 5
    expect(parse({ alias: 'a'.repeat(21) }).success).toBe(false) // 21, y no son 22 dígitos
  })
  it('rechaza espacios y símbolos que no van', () => {
    expect(parse({ alias: 'juan perez' }).success).toBe(false)
    expect(parse({ alias: 'juan_perez' }).success).toBe(false)
    expect(parse({ alias: 'juan@perez' }).success).toBe(false)
  })
  it('un número de 21 o 23 dígitos NO es un CBU', () => {
    expect(parse({ alias: '1'.repeat(21) }).success).toBe(false)
    expect(parse({ alias: '1'.repeat(23) }).success).toBe(false)
  })
  it('NO transforma lo que se escribe: es un identificador de pago', () => {
    const r = parse({ alias: 'Juan.Perez.MP' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.alias).toBe('Juan.Perez.MP')
  })
})
