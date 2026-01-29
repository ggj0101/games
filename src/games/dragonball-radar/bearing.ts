import type { LatLng } from './geo'
import { toRadians } from './geo'

// Initial bearing from a -> b in degrees (0=north, 90=east)
export function bearingDeg(a: LatLng, b: LatLng) {
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)
  const dLng = toRadians(b.lng - a.lng)

  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)

  const brng = Math.atan2(y, x) * (180 / Math.PI)
  const deg = (brng + 360) % 360
  return deg
}

export function normalize180(deg: number) {
  let d = ((deg + 180) % 360) - 180
  if (d < -180) d += 360
  return d
}
