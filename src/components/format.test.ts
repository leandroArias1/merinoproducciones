import { describe, it, expect } from 'vitest'
import { fechaAR, fechaCortaAR, fechaARDesdeClave, fechaLargaAR, numeroAR, ecoPesos, centavosPelados } from './format'

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

/**
 * El eco es solo presentación, pero tiene que hacer evidente el error más caro
 * del sistema: comerse un cero en un monto. Por eso se congela que 75.000 y
 * 750.000 se vean distinto, y que no invente un monto cuando no hay nada.
 */
describe('ecoPesos — lo que se ve mientras se escribe un monto', () => {
  it('un cero de diferencia se ve distinto', () => {
    expect(ecoPesos('75000')).toContain('75.000')
    expect(ecoPesos('750000')).toContain('750.000')
    expect(ecoPesos('75000')).not.toBe(ecoPesos('750000'))
  })

  it('separa los miles en montos grandes', () => {
    expect(ecoPesos('1100000')).toContain('1.100.000')
  })

  it('no dibuja nada mientras no haya un monto', () => {
    expect(ecoPesos('')).toBeNull()
    expect(ecoPesos('   ')).toBeNull()
    expect(ecoPesos('abc')).toBeNull()
    expect(ecoPesos('-500')).toBeNull() // un monto negativo no es un monto
  })

  it('el cero SÍ se muestra: es un monto, no un campo vacío', () => {
    expect(ecoPesos('0')).toContain('0')
  })

  it('no toca lo que el usuario escribió: devuelve un string aparte', () => {
    // Si esto alguna vez devolviera el número parseado y el form lo usara,
    // se guardaría lo que se VE en vez de lo que se escribió.
    const raw = '750000'
    expect(typeof ecoPesos(raw)).toBe('string')
    expect(raw).toBe('750000')
  })
})

/**
 * Lo que se copia al homebanking NO es lo que se ve. En pantalla va "$ 810.000";
 * si eso se pegara en el formulario del banco, lo rechaza por el símbolo y los
 * puntos — y sacarlos a mano es justo lo que el botón de copiar viene a evitar.
 */
describe('centavosPelados — el monto como lo espera el homebanking', () => {
  it('sin símbolo ni separadores de miles', () => {
    expect(centavosPelados(81_000_000n)).toBe('810000')
    expect(centavosPelados(75_000_00n)).toBe('75000')
  })

  it('los centavos solo aparecen si los hay (un prorrateo puede dejarlos)', () => {
    expect(centavosPelados(81_000_050n)).toBe('810000.50')
    expect(centavosPelados(1_01n)).toBe('1.01')
    expect(centavosPelados(1_10n)).toBe('1.10') // el cero final no se pierde
  })

  it('cero', () => {
    expect(centavosPelados(0n)).toBe('0')
  })

  it('nunca devuelve notación científica ni pierde precisión en montos grandes', () => {
    // Con Number esto se rompería; con BigInt no.
    expect(centavosPelados(9_007_199_254_740_993_00n)).toBe('9007199254740993')
  })
})
