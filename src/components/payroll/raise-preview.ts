/**
 * Efecto de un aumento en el mes de la fecha desde la que rige.
 *
 * El dominio prorratea por los días en que el sueldo estuvo vigente dentro del
 * mes; esto lo replica SÓLO para anticiparlo antes de aplicar, así el usuario
 * ve que elegir una fecha a mitad de mes le va a pagar menos que el sueldo
 * declarado. Es la misma cuenta que ya validamos a mano contra el sistema real:
 * días vigentes / días del mes, contando el día de vigencia inclusive (un
 * aumento del 25/07 rige 7 de los 31 días de julio).
 *
 * Vive en un archivo sin JSX para poder testearlo con la corrida unitaria.
 */
export interface EfectoAumento {
  completo: boolean
  diasVigentes: number
  diasDelMes: number
  mesLabel: string
  cobra: number
}

export function efectoEnElMes(fechaKey: string, sueldo: number): EfectoAumento | null {
  const [y, m, d] = fechaKey.split('-').map(Number)
  if (!y || !m || !d) return null
  // Day 0 del mes siguiente = último día de este mes. Todo en UTC para que no
  // dependa de la zona de quien mire.
  const diasDelMes = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const diasVigentes = diasDelMes - d + 1
  const mesLabel = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  )
  return {
    completo: d === 1,
    diasVigentes,
    diasDelMes,
    mesLabel,
    cobra: Math.round((sueldo * diasVigentes) / diasDelMes),
  }
}
