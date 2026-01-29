<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import type { LatLng } from './geo'
import { haversineMeters, toLocalMeters } from './geo'
import { bearingDeg, normalize180 } from './bearing'
import { clamp, pickRadarRange } from './radar'

type Target = LatLng & { name: string; kind: 'dragonball'; color: string }

// Targets (WGS84) — dragonballs (no order)
const targets: Target[] = [
  { name: '新竹火車站', kind: 'dragonball', lat: 24.801588, lng: 120.971794, color: '#ffb020' },
  { name: '巨城購物中心', kind: 'dragonball', lat: 24.809449, lng: 120.9727305, color: '#4da3ff' },
  { name: '老家', kind: 'dragonball', lat: 24.79959308997481, lng: 120.9214003201404, color: '#ff5aa5' },
  { name: '大庄', kind: 'dragonball', lat: 24.791037965646897, lng: 120.92589452577819, color: '#a78bfa' }
]

const successRadiusMeters = 50

const LS_KEY = 'dragonballRadar.found.v1'

const hasGeo = typeof navigator !== 'undefined' && 'geolocation' in navigator

function copyText(text: string) {
  try {
    navigator.clipboard?.writeText(text)
  } catch {
    // ignore
  }
}

const status = ref<'idle' | 'watching' | 'denied' | 'error' | 'success'>('idle')
const errorMsg = ref<string>('')

const userPos = ref<LatLng | null>(null)
const accuracy = ref<number | null>(null)

// Movement (course over ground) estimated from GPS deltas.
const lastFix = ref<{ pos: LatLng; t: number } | null>(null)
const courseDeg = ref<number | null>(null)

const found = ref<Record<string, true>>({})

function loadFound() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) {
      found.value = Object.fromEntries(arr.map((name) => [String(name), true]))
    }
  } catch {
    // ignore
  }
}

function saveFound() {
  try {
    const arr = Object.keys(found.value)
    localStorage.setItem(LS_KEY, JSON.stringify(arr))
  } catch {
    // ignore
  }
}

function markFound(name: string) {
  if (found.value[name]) return
  found.value = { ...found.value, [name]: true }
  saveFound()
}

function resetProgress() {
  found.value = {}
  try {
    localStorage.removeItem(LS_KEY)
  } catch {
    // ignore
  }
  status.value = 'idle'
}

const remainingTargets = computed(() => targets.filter((t) => !found.value[t.name]))

const distances = computed(() => {
  if (!userPos.value) return []
  return targets
    .map((t) => {
      const meters = haversineMeters(userPos.value!, t)
      const brng = bearingDeg(userPos.value!, t)
      const hdg = effectiveHeadingDeg.value
      const delta = hdg == null ? null : normalize180(brng - hdg)
      return {
        target: t,
        meters,
        bearing: brng,
        delta,
        isFound: !!found.value[t.name]
      }
    })
    .sort((a, b) => a.meters - b.meters)
})

const nearest = computed(() => {
  if (!userPos.value) return null
  const list = remainingTargets.value.length ? remainingTargets.value : targets
  const ds = list.map((t) => ({ t, meters: haversineMeters(userPos.value!, t) }))
  ds.sort((a, b) => a.meters - b.meters)
  return ds[0]
})

const allFound = computed(() => Object.keys(found.value).length >= targets.length)

// Auto scale: use the nearest target as the reference.
// Anything beyond range is clamped to the outer ring.
const range = computed(() => {
  const n = nearest.value
  if (!n) return { rangeMeters: 2000, mapZoom: 15 }

  // Auto range that still lets the blip move toward the center as you approach.
  // Use a fixed padding instead of a pure ratio; otherwise the nearest blip would
  // stick near the same ring forever.
  const paddingMeters = 200
  const autoRangeMeters = clamp(Math.max(60, n.meters + paddingMeters), 60, 4000)

  const z = pickRadarRange(n.meters).mapZoom
  return { rangeMeters: Math.round(autoRangeMeters), mapZoom: z }
})

const mapUrl = computed(() => {
  // No-key embed; center on user if available.
  const z = range.value.mapZoom
  const center = userPos.value ?? nearest.value?.t ?? targets[0]!
  const q = `${center.lat},${center.lng}`
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=${z}&output=embed`
})

const watchId = ref<number | null>(null)

// Map/radar orientation mode:
// - north-up: match Google Maps default
// - heading-up: rotate map+overlay so screen-up = phone forward
const alignMode = ref<'north-up' | 'heading-up'>('heading-up')

// Smooth DOM rotation so we don't jump at 359° -> 0°.
const mapRotationDeg = ref<number>(0)

// Arrow mode:
// - locked: keep arrows at screen top
// - dynamic: arrows indicate angles (depending on mode)
const lockArrowsTop = ref<boolean>(true)

// Opacity controls (persisted)
const MAP_OPACITY_KEY = 'dragonballRadar.mapOpacity.v1'
const HUD_OPACITY_KEY = 'dragonballRadar.hudOpacity.v1'
const mapOpacity = ref<number>(1)
const hudOpacity = ref<number>(0.6)

function loadOpacity() {
  try {
    const m = Number(localStorage.getItem(MAP_OPACITY_KEY))
    if (Number.isFinite(m)) mapOpacity.value = Math.max(0, Math.min(1, m))
    const h = Number(localStorage.getItem(HUD_OPACITY_KEY))
    if (Number.isFinite(h)) hudOpacity.value = Math.max(0, Math.min(1, h))
  } catch {
    // ignore
  }
}

function saveOpacity() {
  try {
    localStorage.setItem(MAP_OPACITY_KEY, String(mapOpacity.value))
    localStorage.setItem(HUD_OPACITY_KEY, String(hudOpacity.value))
  } catch {
    // ignore
  }
}

// --- Device heading (compass) ---
// Goal: radar "up" is always the phone's forward direction.
const headingDeg = ref<number | null>(null)
const headingError = ref<string>('')
const screenAngleDeg = ref<number>(0)

let orientationHandler: ((e: DeviceOrientationEvent) => void) | null = null
let screenOrientationHandler: (() => void) | null = null

function normalizeDeg(d: number) {
  const x = d % 360
  return x < 0 ? x + 360 : x
}

function updateScreenAngle() {
  // Prefer Screen Orientation API.
  const so = (screen as any)?.orientation
  if (so && typeof so.angle === 'number' && Number.isFinite(so.angle)) {
    screenAngleDeg.value = normalizeDeg(so.angle)
    return
  }

  // Fallback (legacy iOS): window.orientation
  const wo = (window as any)?.orientation
  if (typeof wo === 'number' && Number.isFinite(wo)) {
    screenAngleDeg.value = normalizeDeg(wo)
    return
  }

  screenAngleDeg.value = 0
}

// Offset disabled per request.
const effectiveHeadingDeg = computed(() => {
  if (headingDeg.value == null) return null
  // Compensate screen rotation (portrait/landscape) so "up" stays phone-forward.
  return normalizeDeg(headingDeg.value - screenAngleDeg.value)
})

function computeHeadingFromEvent(e: DeviceOrientationEvent) {
  // iOS Safari
  const ios = e as unknown as { webkitCompassHeading?: number }
  if (typeof ios.webkitCompassHeading === 'number' && Number.isFinite(ios.webkitCompassHeading)) {
    return normalizeDeg(ios.webkitCompassHeading)
  }

  // Generic (often Android Chrome): alpha is rotation around Z.
  // Convention varies; using (360 - alpha) usually maps to compass-like heading.
  if (typeof e.alpha === 'number' && Number.isFinite(e.alpha)) {
    return normalizeDeg(360 - e.alpha)
  }

  return null
}

async function startCompass() {
  headingError.value = ''

  if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') {
    headingError.value = '此裝置/瀏覽器不支援指南針（DeviceOrientation）。'
    return
  }

  const anyDO = DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<'granted' | 'denied'>
  }

  // iOS 13+ requires user gesture + permission.
  if (typeof anyDO.requestPermission === 'function') {
    const res = await anyDO.requestPermission().catch(() => 'denied' as const)
    if (res !== 'granted') {
      headingError.value = '指南針權限被拒絕。'
      return
    }
  }

  if (!orientationHandler) {
    orientationHandler = (e: DeviceOrientationEvent) => {
      const h = computeHeadingFromEvent(e)
      if (h != null) headingDeg.value = h
    }
  }

  if (!screenOrientationHandler) {
    screenOrientationHandler = () => updateScreenAngle()
  }

  updateScreenAngle()
  window.addEventListener('orientationchange', screenOrientationHandler as any)
  ;(screen as any)?.orientation?.addEventListener?.('change', screenOrientationHandler as any)

  window.addEventListener('deviceorientationabsolute', orientationHandler as any, true)
  window.addEventListener('deviceorientation', orientationHandler as any, true)
}

function stopCompass() {
  if (orientationHandler) {
    window.removeEventListener('deviceorientationabsolute', orientationHandler as any, true)
    window.removeEventListener('deviceorientation', orientationHandler as any, true)
  }
  if (screenOrientationHandler) {
    window.removeEventListener('orientationchange', screenOrientationHandler as any)
    ;(screen as any)?.orientation?.removeEventListener?.('change', screenOrientationHandler as any)
  }
}

function startWatch() {
  if (!hasGeo) {
    status.value = 'error'
    errorMsg.value = '此瀏覽器不支援定位（Geolocation）。'
    return
  }

  status.value = 'watching'
  errorMsg.value = ''

  watchId.value = navigator.geolocation.watchPosition(
    (pos) => {
      const now = Date.now()
      const nextPos = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      userPos.value = nextPos
      accuracy.value = pos.coords.accuracy ?? null

      // Estimate movement direction (course) from last GPS fix.
      if (lastFix.value) {
        const dt = (now - lastFix.value.t) / 1000
        const moved = haversineMeters(lastFix.value.pos, nextPos)

        // Filter tiny jitter; require a bit of movement.
        if (dt > 0.2 && dt < 20 && moved > 2) {
          const b = bearingDeg(lastFix.value.pos, nextPos)
          // Smooth course to reduce jitter.
          if (courseDeg.value == null) {
            courseDeg.value = b
          } else {
            // circular lerp
            const prev = courseDeg.value
            const diff = normalize180(b - prev)
            courseDeg.value = (prev + diff * 0.25 + 360) % 360
          }
        }
      }
      lastFix.value = { pos: nextPos, t: now }

      // Mark any nearby (unfound) dragonball as found.
      for (const t of remainingTargets.value) {
        const d = haversineMeters(userPos.value, t)
        if (d <= successRadiusMeters) {
          markFound(t.name)
        }
      }

      if (allFound.value) {
        status.value = 'success'
      }
    },
    (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        status.value = 'denied'
        errorMsg.value = '定位權限被拒絕。請在瀏覽器/系統設定允許定位後重試。'
      } else {
        status.value = 'error'
        errorMsg.value = err.message || '定位失敗。'
      }
    },
    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 10000
    }
  )
}

function stopWatch() {
  if (watchId.value != null && hasGeo) {
    navigator.geolocation.clearWatch(watchId.value)
  }
  watchId.value = null
}

// --- Radar canvas ---
const canvasRef = ref<HTMLCanvasElement | null>(null)
let rafId: number | null = null

function drawFrame(tMs: number) {
  const canvas = canvasRef.value
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx) return

  const w = canvas.width
  const h = canvas.height
  const cx = w / 2
  const cy = h / 2
  const r = Math.min(w, h) * 0.46

  // Trail fade (keep map visible behind)
  ctx.fillStyle = 'rgba(0,0,0,0.08)'
  ctx.fillRect(0, 0, w, h)

  // Radar circles + cross
  ctx.save()
  ctx.translate(cx, cy)

  ctx.strokeStyle = 'rgba(80, 255, 160, 0.25)'
  ctx.lineWidth = 2
  for (const k of [0.25, 0.5, 0.75, 1]) {
    ctx.beginPath()
    ctx.arc(0, 0, r * k, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.beginPath()
  ctx.moveTo(-r, 0)
  ctx.lineTo(r, 0)
  ctx.moveTo(0, -r)
  ctx.lineTo(0, r)
  ctx.stroke()

  // Sweep line
  const speed = status.value === 'success' ? 0.0 : 0.45 // turns/sec
  const angle = ((tMs / 1000) * speed * Math.PI * 2) % (Math.PI * 2)
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r)
  grad.addColorStop(0, 'rgba(80,255,160,0.55)')
  grad.addColorStop(0.65, 'rgba(80,255,160,0.18)')
  grad.addColorStop(1, 'rgba(80,255,160,0)')

  ctx.rotate(angle)
  ctx.strokeStyle = 'rgba(80,255,160,0.75)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(r, 0)
  ctx.stroke()

  // Sweep wedge glow
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.arc(0, 0, r, -0.16, 0.16)
  ctx.closePath()
  ctx.fill()

  // Target blip
  if (userPos.value) {
    const rangeMeters = range.value.rangeMeters

    for (const t of targets) {
      let { dx, dy } = toLocalMeters(userPos.value, t)
      const d = haversineMeters(userPos.value, t)
      const isFound = !!found.value[t.name]

      // In map-background mode, keep the radar north-up (same as Google Maps).
      // Phone heading is shown separately as an arrow marker.

      // Map meters to pixels (clamped to radius)
      const nx = dx / rangeMeters
      const ny = -dy / rangeMeters
      const isClamped = Math.abs(nx) > 1 || Math.abs(ny) > 1

      const px = clamp(nx, -1, 1) * r
      const py = clamp(ny, -1, 1) * r

      const near = clamp(1 - d / rangeMeters, 0, 1)
      const sizeBase = 3
      const size = sizeBase + near * 7

      // If the point is out of range, emphasize it (edge arrow + blink).
      const blink = 0.55 + 0.45 * Math.sin(tMs / 180)
      const alpha = isClamped ? 0.35 + 0.45 * blink : 0.25 + near * 0.75

      ctx.save()
      ctx.rotate(-angle) // keep blips stable while sweep rotates

      if (isFound) {
        // Found: dimmed green
        ctx.fillStyle = `rgba(90, 255, 170, ${alpha * 0.45})`
        ctx.strokeStyle = `rgba(90, 255, 170, ${alpha * 0.25})`
      } else {
        // Unfound: per-target color
        ctx.fillStyle = `${t.color}${Math.round(alpha * 255)
          .toString(16)
          .padStart(2, '0')}`
        ctx.strokeStyle = `${t.color}${Math.round(alpha * 0.55 * 255)
          .toString(16)
          .padStart(2, '0')}`
      }

      ctx.beginPath()
      ctx.arc(px, py, size, 0, Math.PI * 2)
      ctx.fill()

      // Outer pulse
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(px, py, size + 6 + Math.sin(tMs / 140) * 2, 0, Math.PI * 2)
      ctx.stroke()

      // Edge arrow if clamped
      if (isClamped) {
        const ang = Math.atan2(py, px)
        const ax = Math.cos(ang) * (r - 6)
        const ay = Math.sin(ang) * (r - 6)
        const s = 10
        ctx.fillStyle = isFound
          ? `rgba(90, 255, 170, ${0.25 + 0.35 * blink})`
          : `${t.color}${Math.round((0.45 + 0.45 * blink) * 255)
              .toString(16)
              .padStart(2, '0')}`

        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.lineTo(ax - Math.cos(ang - 0.55) * s, ay - Math.sin(ang - 0.55) * s)
        ctx.lineTo(ax - Math.cos(ang + 0.55) * s, ay - Math.sin(ang + 0.55) * s)
        ctx.closePath()
        ctx.fill()
      }

      ctx.restore()
    }
  }

  // Markers (stable relative to north-up)
  ctx.save()
  ctx.rotate(-angle)

  // Cardinal directions (north-up)
  ctx.fillStyle = 'rgba(255,255,255,0.78)'
  ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const labelR = r - 12
  const cardinals: Array<[string, number]> = [
    ['N', 0],
    ['E', Math.PI / 2],
    ['S', Math.PI],
    ['W', (Math.PI * 3) / 2]
  ]
  for (const [lab, ang] of cardinals) {
    const x = Math.cos(ang - Math.PI / 2) * labelR
    const y = Math.sin(ang - Math.PI / 2) * labelR
    ctx.fillText(lab, x, y)
  }

  // Phone forward arrow removed per request.

  // Movement/course arrow (cyan)
  if (courseDeg.value != null) {
    let cDeg: number
    if (lockArrowsTop.value) {
      cDeg = 0
    } else if (alignMode.value === 'heading-up' && effectiveHeadingDeg.value != null) {
      // Map is rotated to phone heading, so show course relative to phone-forward.
      cDeg = normalize180(courseDeg.value - effectiveHeadingDeg.value)
    } else {
      // North-up: show absolute course.
      cDeg = courseDeg.value
    }

    const c = (cDeg * Math.PI) / 180
    const tipR = r - 26
    const tx = Math.cos(c - Math.PI / 2) * tipR
    const ty = Math.sin(c - Math.PI / 2) * tipR

    const s = 10
    ctx.fillStyle = 'rgba(120, 220, 255, 0.95)'
    ctx.beginPath()
    ctx.moveTo(tx, ty)
    ctx.lineTo(tx - Math.cos(c - Math.PI / 2 - 0.55) * s, ty - Math.sin(c - Math.PI / 2 - 0.55) * s)
    ctx.lineTo(tx - Math.cos(c - Math.PI / 2 + 0.55) * s, ty - Math.sin(c - Math.PI / 2 + 0.55) * s)
    ctx.closePath()
    ctx.fill()
  }

  ctx.restore()

  // Scale bar (bottom-left)
  {
    const rangeMeters = range.value.rangeMeters
    const nice: number[] = [10, 20, 50, 100, 200, 500, 1000, 2000]
    // target ~ 1/3 radius
    const targetMeters = rangeMeters * 0.33
    let barMeters: number = nice[0]!
    for (const v of nice) {
      if (v <= targetMeters) barMeters = v
    }

    const barPx = (barMeters / rangeMeters) * r

    ctx.save()
    ctx.rotate(-angle)
    ctx.translate(-r + 14, r - 18)

    // Background label box first (so it doesn't cover the bar)
    ctx.fillStyle = 'rgba(0,0,0,0.70)'
    ctx.fillRect(-8, -22, barPx + 16, 22)

    ctx.strokeStyle = 'rgba(255,255,255,0.95)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(barPx, 0)
    ctx.stroke()

    // End ticks
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, -5)
    ctx.lineTo(0, 5)
    ctx.moveTo(barPx, -5)
    ctx.lineTo(barPx, 5)
    ctx.stroke()

    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(`${barMeters} m`, 0, -20)

    ctx.restore()
  }

  // Border
  ctx.strokeStyle = 'rgba(80,255,160,0.55)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.stroke()

  ctx.restore()

  // Smooth rotation for map/overlay (DOM) in heading-up mode.
  // We rotate the whole stack by -heading; smooth with shortest-angle step.
  if (alignMode.value === 'heading-up' && effectiveHeadingDeg.value != null) {
    // Keep rotation in (-180..180] to avoid 0/360 wrap causing an extra spin.
    const target = normalize180(-effectiveHeadingDeg.value)
    mapRotationDeg.value = normalize180(
      mapRotationDeg.value + normalize180(target - mapRotationDeg.value) * 0.25
    )
  } else {
    mapRotationDeg.value = 0
  }

  rafId = requestAnimationFrame(drawFrame)
}

onMounted(() => {
  loadFound()
  loadOpacity()
  // Try to start compass automatically (may require user gesture on iOS).
  startCompass()

  // Init canvas background once
  const canvas = canvasRef.value
  if (canvas) {
    const size = 360
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (ctx) {
      // Keep transparent so Google Maps can be seen underneath.
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }
  rafId = requestAnimationFrame(drawFrame)

  // If previously completed, reflect it.
  if (allFound.value) status.value = 'success'
})

onBeforeUnmount(() => {
  stopWatch()
  stopCompass()
  if (rafId != null) cancelAnimationFrame(rafId)
})
</script>

<template>
  <div class="radar-full">
    <v-card rounded="lg" variant="tonal" class="pa-4 radar-card">
      <div class="d-flex align-center justify-space-between mb-2">
        <div>
          <div class="text-subtitle-1 font-weight-bold">龍珠雷達</div>
          <div class="text-caption text-medium-emphasis">
            找到所有龍珠（無順序）。接近會自動拉近；超出範圍會顯示外圈箭頭。
          </div>
        </div>
        <v-chip variant="flat" :color="allFound ? 'green' : 'amber'">
          {{ Object.keys(found).length }} / {{ targets.length }}
        </v-chip>
      </div>

      <div class="d-flex justify-center">
        <div class="radar-stack">
          <div
            class="radar-stack"
            :class="{ 'heading-up': alignMode === 'heading-up' }"
            :style="{
              ...(alignMode === 'heading-up' ? { transform: `rotate(${mapRotationDeg}deg)` } : {}),
              '--map-opacity': String(mapOpacity),
              '--hud-opacity': String(hudOpacity)
            }"
          >
            <iframe
              class="map-iframe"
              :src="mapUrl"
              loading="lazy"
              referrerpolicy="no-referrer-when-downgrade"
            />
            <canvas ref="canvasRef" class="radar-canvas" />
          </div>
        </div>
      </div>

      <div class="mt-3 d-flex flex-wrap gap-2">
        <v-chip variant="tonal">range: {{ range.rangeMeters }}m</v-chip>
        <v-chip v-if="nearest" variant="tonal">最近: {{ nearest.t.name }} · {{ Math.round(nearest.meters) }}m</v-chip>
        <v-chip v-if="accuracy != null" variant="tonal">精度: ±{{ Math.round(accuracy) }}m</v-chip>
        <v-chip v-if="effectiveHeadingDeg != null" variant="tonal">方位(手機): {{ Math.round(effectiveHeadingDeg) }}°</v-chip>
        <v-chip v-if="courseDeg != null" variant="tonal">方位(行進): {{ Math.round(courseDeg) }}°</v-chip>

        <v-chip v-if="userPos" variant="tonal">
          目前座標: {{ userPos.lat.toFixed(6) }}, {{ userPos.lng.toFixed(6) }}
        </v-chip>
      </div>

      <v-card variant="tonal" rounded="lg" class="mt-3 pa-3">
        <div class="text-subtitle-2 font-weight-bold mb-2">透明度</div>

        <div class="text-caption text-medium-emphasis">Google Maps：{{ Math.round(mapOpacity * 100) }}%</div>
        <v-slider
          v-model="mapOpacity"
          :min="0"
          :max="1"
          :step="0.05"
          thumb-label
          class="mt-1"
          @end="saveOpacity"
        />

        <div class="text-caption text-medium-emphasis">Canvas：{{ Math.round(hudOpacity * 100) }}%</div>
        <v-slider
          v-model="hudOpacity"
          :min="0"
          :max="1"
          :step="0.05"
          thumb-label
          class="mt-1"
          @end="saveOpacity"
        />
      </v-card>

      <div v-if="userPos" class="mt-2 d-flex flex-wrap gap-2">
        <v-btn
          size="small"
          variant="outlined"
          @click="copyText(`${userPos.lat},${userPos.lng}`)"
        >
          複製座標
        </v-btn>
        <v-btn
          size="small"
          variant="outlined"
          @click="copyText(`https://www.google.com/maps?q=${userPos.lat},${userPos.lng}`)"
        >
          複製 Google Maps 連結
        </v-btn>
      </div>

      <div class="mt-2 d-flex flex-wrap gap-2">
        <v-btn
          size="small"
          variant="outlined"
          :disabled="effectiveHeadingDeg == null"
          @click="alignMode = alignMode === 'north-up' ? 'heading-up' : 'north-up'"
        >
          地圖對齊：{{ alignMode === 'north-up' ? '北朝上' : '面向上' }}
        </v-btn>

        <v-btn
          size="small"
          variant="outlined"
          @click="lockArrowsTop = !lockArrowsTop"
        >
          箭頭：{{ lockArrowsTop ? '固定上方' : '顯示角度' }}
        </v-btn>

        <!-- offset controls removed -->
      </div>

      <v-alert v-if="headingError" type="info" class="mt-3" variant="tonal">
        {{ headingError }}
        <div class="mt-2">
          <v-btn size="small" variant="outlined" @click="startCompass">啟用指南針</v-btn>
        </div>
      </v-alert>

      <v-alert v-if="errorMsg" type="warning" class="mt-3" variant="tonal">
        {{ errorMsg }}
      </v-alert>

      <div class="mt-3 d-flex gap-2 flex-wrap">
        <v-btn color="primary" :disabled="status === 'watching'" @click="startWatch">
          啟動定位
        </v-btn>
        <v-btn variant="tonal" :disabled="watchId == null" @click="stopWatch">
          停止
        </v-btn>
        <v-btn variant="outlined" color="error" @click="resetProgress">
          重玩（清除紀錄）
        </v-btn>
      </div>

      <div class="mt-4">
        <div class="text-subtitle-2 font-weight-bold mb-2">龍珠清單</div>
        <div class="d-flex flex-column" style="gap: 6px;">
          <div v-for="d in distances" :key="d.target.name" class="d-flex align-center justify-space-between">
            <span class="text-body-2 d-flex align-center" style="gap: 8px;">
              <span v-if="d.isFound">✅</span>
              <span v-else>🟠</span>
              <span class="dot" :style="{ background: d.isFound ? '#5affaa' : d.target.color }" />
              <span>{{ d.target.name }}</span>
            </span>
            <span class="text-body-2 text-medium-emphasis">
              {{ Math.round(d.meters) }}m
              <span v-if="d.delta != null"> · Δ{{ Math.round(d.delta) }}°</span>
            </span>
          </div>
        </div>
      </div>

      <v-alert v-if="allFound" type="success" class="mt-4" variant="tonal">
        全部找到！你可以按「重玩」再來一次。
      </v-alert>

      <div class="mt-3 text-caption text-medium-emphasis">
        提醒：定位需要 HTTPS 或 localhost 環境。
      </div>
    </v-card>
  </div>
</template>

<style scoped>
.radar-full {
  min-height: 100vh;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.radar-card {
  width: min(560px, 100%);
}

.radar-stack {
  position: relative;
  width: min(78vw, 420px);
  height: min(78vw, 420px);
  border-radius: 999px;
  overflow: hidden;
  transform-origin: center center;
  /* rotation is smoothed in JS to avoid 359° -> 0° jump */
  transition: none;
}

:root {
  /* You can tune these to taste. */
  --map-opacity: 1;
  --hud-opacity: 0.6;
}

.map-iframe {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
  z-index: 0;
  opacity: var(--map-opacity);
  /* Don't steal scroll/drag; radar is a HUD. */
  pointer-events: none;
  filter: saturate(1.05) contrast(1.05);
}

.radar-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  opacity: var(--hud-opacity);
  border-radius: 999px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  box-shadow: 0 0 10px rgba(255, 255, 255, 0.12);
}

.gap-2 {
  gap: 8px;
}
</style>
