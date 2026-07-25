import { describe, it, expect } from 'vitest'
import { employeeSchema, todayInBA } from './schema'

const base = {
  firstName: 'A',
  lastName: 'B',
  documentId: '40111222',
  email: '',
  phone: '',
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
