<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import type { LatLng } from './geo'
import { haversineMeters, toLocalMeters } from './geo'
import { clamp, pickRadarRange } from './radar'

type Target = LatLng & { name: string; kind: 'dragonball' }

// Targets (WGS84) — dragonballs (no order)
const targets: Target[] = [
  { name: '新竹火車站', kind: 'dragonball', lat: 24.801588, lng: 120.971794 },
  { name: '巨城購物中心', kind: 'dragonball', lat: 24.809449, lng: 120.9727305 },
  { name: '新竹市香山綜合運動場', kind: 'dragonball', lat: 24.797, lng: 120.949 }
]

const successRadiusMeters = 50

const LS_KEY = 'dragonballRadar.found.v1'

const hasGeo = typeof navigator !== 'undefined' && 'geolocation' in navigator

const status = ref<'idle' | 'watching' | 'denied' | 'error' | 'success'>('idle')
const errorMsg = ref<string>('')

const userPos = ref<LatLng | null>(null)
const accuracy = ref<number | null>(null)

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
    .map((t) => ({
      target: t,
      meters: haversineMeters(userPos.value!, t),
      isFound: !!found.value[t.name]
    }))
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

  // Kept for future (map removed), but still handy as a proxy for scale.
  const z = pickRadarRange(n.meters).mapZoom
  return { rangeMeters: Math.round(autoRangeMeters), mapZoom: z }
})

const watchId = ref<number | null>(null)

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

// Empirical offset: some browsers report heading axis rotated by 90°.
// Positive means rotate clockwise.
const headingOffsetDeg = 90

const effectiveHeadingDeg = computed(() => {
  if (headingDeg.value == null) return null
  // Compensate screen rotation (portrait/landscape) so "up" stays phone-forward.
  // Also apply an offset to align axes across devices.
  return normalizeDeg(headingDeg.value - screenAngleDeg.value + headingOffsetDeg)
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
      userPos.value = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      accuracy.value = pos.coords.accuracy ?? null

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

  // Trail fade
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
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
  const speed = status.value === 'success' ? 0.0 : 0.9 // turns/sec
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

      // Rotate into device frame so the radar "up" follows phone heading.
      // headingDeg: 0=north, 90=east.
      if (effectiveHeadingDeg.value != null) {
        // Rotate world into device frame.
        // Use -heading so that the radar's up direction equals phone forward.
        const h = (-effectiveHeadingDeg.value * Math.PI) / 180
        const rx = dx * Math.cos(h) - dy * Math.sin(h)
        const ry = dx * Math.sin(h) + dy * Math.cos(h)
        dx = rx
        dy = ry
      }

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
        // Unfound: warm amber
        ctx.fillStyle = `rgba(255, 170, 60, ${alpha})`
        ctx.strokeStyle = `rgba(255, 190, 90, ${alpha * 0.55})`
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
          : `rgba(255, 190, 90, ${0.45 + 0.45 * blink})`

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

  // Border
  ctx.strokeStyle = 'rgba(80,255,160,0.55)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.stroke()

  ctx.restore()

  rafId = requestAnimationFrame(drawFrame)
}

onMounted(() => {
  loadFound()
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
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
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
        <canvas ref="canvasRef" class="radar-canvas" />
      </div>

      <div class="mt-3 d-flex flex-wrap gap-2">
        <v-chip variant="tonal">range: {{ range.rangeMeters }}m</v-chip>
        <v-chip v-if="nearest" variant="tonal">最近: {{ nearest.t.name }} · {{ Math.round(nearest.meters) }}m</v-chip>
        <v-chip v-if="accuracy != null" variant="tonal">精度: ±{{ Math.round(accuracy) }}m</v-chip>
        <v-chip v-if="effectiveHeadingDeg != null" variant="tonal">方位: {{ Math.round(effectiveHeadingDeg) }}°</v-chip>
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
            <span class="text-body-2">
              <span v-if="d.isFound">✅</span>
              <span v-else>🟠</span>
              {{ d.target.name }}
            </span>
            <span class="text-body-2 text-medium-emphasis">{{ Math.round(d.meters) }} m</span>
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

.radar-canvas {
  width: min(78vw, 420px);
  height: min(78vw, 420px);
  border-radius: 999px;
}

.gap-2 {
  gap: 8px;
}
</style>
