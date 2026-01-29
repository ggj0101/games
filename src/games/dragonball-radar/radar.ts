export type RadarRange = {
  rangeMeters: number
  mapZoom: number
}

export function pickRadarRange(distanceMeters: number): RadarRange {
  if (distanceMeters > 2000) return { rangeMeters: 4000, mapZoom: 13 }
  if (distanceMeters > 500) return { rangeMeters: 2000, mapZoom: 15 }
  if (distanceMeters > 150) return { rangeMeters: 500, mapZoom: 17 }
  if (distanceMeters > 40) return { rangeMeters: 150, mapZoom: 18 }
  return { rangeMeters: 60, mapZoom: 19 }
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}
