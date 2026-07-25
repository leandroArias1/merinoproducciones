import { describe, it, expect } from 'vitest'
import { fechaAR, fechaCortaAR, fechaARDesdeClave, fechaLargaAR, numeroAR } from './format'

/**
 * El borde importante es la ZONA: los días de negocio son `@db.Date` y Prisma
 * los devuelve a medianoche UTC. Si el formateo los lee en hora local, en
 * Buenos Aires (UTC-3) medianoche UTC cae a las 21:00 del día ANTERIOR y toda
 * la app muestra un día menos. Ese error ya apareció dos veces en este
 * proyecto, así que queda congelado acá.
 */

/** Un workDate tal como lo devuelve Prisma para una columna @db.Date. */
const dbDate = (key: string) => new Date(`${key}T00:00:00.000Z`)

describe('formato de presentación', () => {
  it('fechaAR: día de negocio en formato argentino, sin correrse un día', () => {
    expect(fechaAR(dbDate('2026-07-28'))).toBe('28/07/2026')
    expect(fechaAR(dbDate('2026-01-01'))).toBe('01/01/2026') // borde de año
    expect(fechaAR(dbDate('2026-03-01'))).toBe('01/03/2026') // borde de mes
  })

  it('fechaAR: rellena con cero a la izquierda día y mes', () => {
    expect(fechaAR(dbDate('2026-09-05'))).toBe('05/09/2026')
  })

  it('fechaCortaAR: dos dígitos de año para columnas angostas', () => {
    expect(fechaCortaAR(dbDate('2026-07-28'))).toBe('28/07/26')
  })

  it('fechaARDesdeClave: convierte lo que ya viaja como string', () => {
    expect(fechaARDesdeClave('2026-07-28')).toBe('28/07/2026')
  })

  it('fechaLargaAR: encabezados legibles, también resuelto en UTC', () => {
    // 28/07/2026 es martes. Si se interpretara en local daría "lunes 27".
    const larga = fechaLargaAR(dbDate('2026-07-28'))
    expect(larga).toContain('28')
    expect(larga).toContain('julio')
    expect(larga.startsWith('lunes')).toBe(false)
  })

  it('numeroAR: separador de miles argentino', () => {
    expect(numeroAR(1100000)).toBe('1.100.000')
    expect(numeroAR(0)).toBe('0')
  })
})
