<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PixiRadarOverlay from './PixiRadarOverlay.vue'

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

// (removed) openInBrowser: google maps embed disabled.

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

// --- Google Maps embed (optional background) ---
const showMap = ref<boolean>(true)

// Leaflet map (OSM tiles) — smooth pan without iframe reload
const mapCenter = ref<LatLng>({ lat: targets[0]!.lat, lng: targets[0]!.lng })
const mapZoom = ref<number>(15)
const leafletRef = ref<HTMLDivElement | null>(null)
let map: any = null
let tileLayer: any = null
let userMarker: any = null

function round(n: number, digits: number) {
  const k = 10 ** digits
  return Math.round(n * k) / k
}

let lastMapUpdateAt = 0

function updateMapView(force = false) {
  const center = userPos.value ?? nearest.value?.t
  if (!center) return

  const moved = haversineMeters(mapCenter.value, center)
  const nextZoom = range.value.mapZoom
  const now = Date.now()

  // Follow-mode behavior: keep the map feeling "alive" while you walk.
  // - Update when moved > ~10m
  // - Or at least every 5s (prevents "stuck" feeling during slow movement)
  // - Still update on zoom changes
  if (force || moved > 10 || now - lastMapUpdateAt > 5000 || nextZoom !== mapZoom.value) {
    mapCenter.value = { lat: round(center.lat, 5), lng: round(center.lng, 5) }
    mapZoom.value = nextZoom
    lastMapUpdateAt = now

    // Leaflet smooth pan (no iframe reload / flashing)
    if (showMap.value && map) {
      const latlng = [mapCenter.value.lat, mapCenter.value.lng]

      try {
        userMarker?.setLatLng?.(latlng)
      } catch {
        // ignore
      }

      // Big jumps or forced recenter should snap; normal updates should animate.
      const bigJump = moved > 120
      if (force || bigJump) {
        map.setView(latlng, mapZoom.value, { animate: false })
      } else {
        map.setZoom(mapZoom.value, { animate: true })
        map.panTo(latlng, { animate: true, duration: 0.6 })
      }
    }
  }
}

// (removed) legacy stub

async function initLeaflet() {
  if (!leafletRef.value) return
  if (map) return

  const L = await import('leaflet')

  map = L.map(leafletRef.value, {
    zoomControl: false,
    attributionControl: true,
    inertia: true,
    worldCopyJump: true
  })

  tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map)

  // User marker (a small dot). We'll update it on each GPS fix.
  userMarker = L.circleMarker([mapCenter.value.lat, mapCenter.value.lng], {
    radius: 6,
    weight: 2,
    color: '#00ff99',
    fillColor: '#00ff99',
    fillOpacity: 0.75
  }).addTo(map)

  map.setView([mapCenter.value.lat, mapCenter.value.lng], mapZoom.value, { animate: false })

  // Apply initial opacity.
  const el = tileLayer.getContainer?.()
  if (el) el.style.opacity = String(mapOpacity.value)

  // Leaflet sometimes needs a size invalidation after mount/visibility changes.
  setTimeout(() => {
    try {
      map?.invalidateSize?.()
    } catch {
      // ignore
    }
  }, 0)
}

function destroyLeaflet() {
  try {
    map?.remove()
  } catch {
    // ignore
  }
  map = null
  tileLayer = null
  userMarker = null
}

// --- Pixi radar overlay data ---
const radarBlips = computed(() => {
  if (!userPos.value) return []
  const rangeMeters = range.value.rangeMeters

  return targets.map((t) => {
    const { dx, dy } = toLocalMeters(userPos.value!, t)
    const nx = dx / rangeMeters
    const ny = -dy / rangeMeters
    return {
      id: t.name,
      name: t.name,
      nx,
      ny,
      isClamped: Math.abs(nx) > 1 || Math.abs(ny) > 1,
      isFound: !!found.value[t.name],
      color: t.color
    }
  })
})

const watchId = ref<number | null>(null)

// Map/radar orientation mode:
// - north-up: match Google Maps default
// - heading-up: rotate map+overlay so screen-up = phone forward
const alignMode = ref<'north-up' | 'heading-up'>('heading-up')

// Smooth DOM rotation so we don't jump at 359° -> 0°.
const mapRotationDeg = ref<number>(0)

// Audio must be unlocked by a user gesture on most mobile browsers.
const audioArmed = ref<boolean>(false)

// Arrow mode:
// - locked: keep arrows at screen top
// - dynamic: arrows indicate angles (depending on mode)
const lockArrowsTop = ref<boolean>(true)

// Opacity controls (persisted)
const MAP_OPACITY_KEY = 'dragonballRadar.mapOpacity.v1'
const HUD_OPACITY_KEY = 'dragonballRadar.hudOpacity.v1'
const mapOpacity = ref<number>(1)
const hudOpacity = ref<number>(0)

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

// eslint-disable-next-line no-unused-vars
let orientationHandler: ((_e: DeviceOrientationEvent) => void) | null = null
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

async function startWatch() {
  if (!hasGeo) {
    status.value = 'error'
    errorMsg.value = '此瀏覽器不支援定位（Geolocation）。'
    return
  }

  // Unlock audio + request compass permission in a user gesture context.
  audioArmed.value = true
  await startCompass()

  status.value = 'watching'
  errorMsg.value = ''

  watchId.value = navigator.geolocation.watchPosition(
    (pos) => {
      const now = Date.now()
      const nextPos = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      userPos.value = nextPos
      accuracy.value = pos.coords.accuracy ?? null
      if (showMap.value) updateMapView(false)

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

// Animation loop for heading-up rotation smoothing.
let rafId: number | null = null

function tick() {
  if (alignMode.value === 'heading-up' && effectiveHeadingDeg.value != null) {
    // Keep rotation in (-180..180] to avoid 0/360 wrap.
    const target = normalize180(-effectiveHeadingDeg.value)
    mapRotationDeg.value = normalize180(
      mapRotationDeg.value + normalize180(target - mapRotationDeg.value) * 0.25
    )
  } else {
    mapRotationDeg.value = 0
  }

  rafId = requestAnimationFrame(tick)
}

onMounted(() => {
  loadFound()
  loadOpacity()

  // Init Leaflet map once.
  if (showMap.value) {
    void initLeaflet().then(() => updateMapView(true))
  }

  // Start rotation smoothing loop (compass permission may still require user gesture).
  if (rafId == null) rafId = requestAnimationFrame(tick)

  // If previously completed, reflect it.
  if (allFound.value) status.value = 'success'
})

watch(showMap, (v) => {
  if (v) {
    void initLeaflet().then(() => updateMapView(true))
  } else {
    destroyLeaflet()
  }
})

watch(mapOpacity, (v) => {
  try {
    const el = tileLayer?.getContainer?.()
    if (el) el.style.opacity = String(v)
  } catch {
    // ignore
  }
})

onBeforeUnmount(() => {
  stopWatch()
  stopCompass()
  destroyLeaflet()
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
        <div class="radar-stack" :style="{ '--map-opacity': String(mapOpacity) }">
          <!-- Bottom layer: Leaflet map (smooth pan, no iframe flicker) -->
          <div v-if="showMap" ref="leafletRef" class="map-leaflet" />

          <!-- Center reticle (makes it obvious the map is panning) -->
          <div v-if="showMap" class="center-reticle" />

          <!-- Top layer: radar overlay; rotate overlay only in heading-up mode -->
          <div
            class="overlay-rot"
            :style="{
              ...(alignMode === 'heading-up' ? { transform: `rotate(${mapRotationDeg}deg)` } : {}),
              opacity: String(hudOpacity)
            }"
          >
            <PixiRadarOverlay
              :blips="radarBlips"
              :range-meters="range.rangeMeters"
              :nearest-id="nearest?.t?.name ?? null"
              :sweep-speed="0.45"
              :audio-armed="audioArmed"
            />
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

        <div class="text-caption text-medium-emphasis">地圖（OSM）：{{ Math.round(mapOpacity * 100) }}%</div>
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

        <v-btn size="small" variant="outlined" @click="showMap = !showMap">
          地圖：{{ showMap ? '顯示' : '隱藏' }}
        </v-btn>

        <v-btn size="small" variant="outlined" :disabled="!showMap" @click="updateMapView(true)">
          地圖置中
        </v-btn>

        <v-btn
          size="small"
          variant="outlined"
          @click="lockArrowsTop = !lockArrowsTop"
        >
          箭頭：{{ lockArrowsTop ? '固定上方' : '顯示角度' }}
        </v-btn>
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

.map-loading {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  color: rgba(255, 255, 255, 0.92);
  font-size: 14px;
  text-align: center;
  padding: 12px;
}

:root {
  /* You can tune these to taste. */
  --map-opacity: 1;
}

.map-leaflet {
  position: absolute;
  inset: 0;
  z-index: 0;
  opacity: var(--map-opacity);
}

.center-reticle {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}

.center-reticle::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 12px;
  height: 12px;
  transform: translate(-50%, -50%);
  border-radius: 999px;
  border: 2px solid rgba(124, 255, 190, 0.9);
  box-shadow: 0 0 18px rgba(124, 255, 190, 0.35);
}

.center-reticle::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 2px;
  height: 18px;
  transform: translate(-50%, -50%);
  background: rgba(124, 255, 190, 0.65);
  box-shadow: 0 0 12px rgba(124, 255, 190, 0.25);
}

.overlay-rot {
  position: absolute;
  inset: 0;
  z-index: 2;
  transform-origin: center center;
  pointer-events: none;
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
