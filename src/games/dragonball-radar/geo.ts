export type LatLng = {
  lat: number
  lng: number
}

const R = 6371000 // meters

export function toRadians(deg: number) {
  return (deg * Math.PI) / 180
}

// Haversine distance in meters.
export function haversineMeters(a: LatLng, b: LatLng) {
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)
  const dLat = lat2 - lat1
  const dLng = toRadians(b.lng - a.lng)

  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)

  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
  return R * c
}

// Convert target relative to origin to local tangent plane (meters).
// dx: east(+), dy: north(+)
export function toLocalMeters(origin: LatLng, target: LatLng) {
  const lat0 = toRadians(origin.lat)
  const dLat = toRadians(target.lat - origin.lat)
  const dLng = toRadians(target.lng - origin.lng)

  const dy = dLat * R
  const dx = dLng * Math.cos(lat0) * R

  return { dx, dy }
}
