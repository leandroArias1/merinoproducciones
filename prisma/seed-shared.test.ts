import { describe, it, expect } from 'vitest'
import { FERIADOS, baWorkDate } from './seed-shared'

/**
 * Un feriado que falta o está mal cargado no se ve en ninguna pantalla: se ve
 * seis meses después, como un descuento de $30.000 en el recibo de cada
 * empleado que tenía turno ese día. Por eso la lista se testea.
 */
describe('feriados del seed', () => {
  it('no hay fechas repetidas (el upsert las taparía en silencio)', () => {
    const fechas = FERIADOS.map((f) => f.date)
    expect(new Set(fechas).size).toBe(fechas.length)
  })

  it('todas las fechas son válidas y con el formato de un día de negocio', () => {
    for (const f of FERIADOS) {
      expect(f.date, `formato de ${f.label}`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      const d = baWorkDate(f.date)
      expect(Number.isNaN(d.getTime()), `fecha inexistente: ${f.date}`).toBe(false)
      // baWorkDate lee en UTC: la clave tiene que sobrevivir el ida y vuelta.
      expect(d.toISOString().slice(0, 10)).toBe(f.date)
    }
  })

  it('están cargados 2026 y 2027, con la cantidad esperada por año', () => {
    const porAnio = new Map<string, number>()
    for (const f of FERIADOS) {
      const a = f.date.slice(0, 4)
      porAnio.set(a, (porAnio.get(a) ?? 0) + 1)
    }
    expect([...porAnio.keys()].sort()).toEqual(['2026', '2027'])
    // 16 por año. Si algún año quedara corto, es que falta cargarlo entero.
    expect(porAnio.get('2026')).toBe(16)
    expect(porAnio.get('2027')).toBe(16)
  })

  it('ningún feriado cae en una fecha que ya pasó sin año siguiente cargado', () => {
    // Guardarraíl de mantenimiento: el último feriado cargado tiene que estar
    // en el futuro respecto del año en curso, si no la app entra a un año sin
    // feriados y empieza a descontar días que no corresponden.
    const ultimo = [...FERIADOS].map((f) => f.date).sort().at(-1) as string
    const anioActual = new Date().getUTCFullYear()
    expect(Number(ultimo.slice(0, 4))).toBeGreaterThan(anioActual)
  })

  it('los trasladables de 2027 caen lunes (es el sentido del traslado)', () => {
    // Si alguno dejara de caer lunes es que se copió la fecha original en vez
    // de la trasladada — y ese día la gente sí trabaja.
    for (const clave of ['2027-06-21', '2027-08-16', '2027-10-11']) {
      const f = FERIADOS.find((x) => x.date === clave)
      expect(f, `falta el feriado ${clave}`).toBeDefined()
      expect(baWorkDate(clave).getUTCDay(), `${clave} debería ser lunes`).toBe(1)
    }
  })
})
