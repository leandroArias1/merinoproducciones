import type { LocationInput } from '@/lib/timeentry/fichaje'

/** Pide geolocalización con timeout; si falla o se niega, devuelve denied (se
 *  ficha igual). Se usa en el fichaje del empleado y del supervisor. */
export function getBrowserLocation(): Promise<LocationInput> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve({ denied: true })
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => resolve({ denied: true }),
      { timeout: 8000, enableHighAccuracy: true },
    )
  })
}
