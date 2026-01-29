<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

type Star = {
  id: number
  x: number
  y: number
  r: number
  vy: number // px/s
}

type Status = 'ready' | 'playing' | 'gameover'

type Config = {
  cssHeight: number
  basketY: number
  basketH: number
  basketWStart: number
  basketWEnd: number
  roundSeconds: number
  lives: number
  spawnMsStart: number
  spawnMsEnd: number
  fallSpeedStart: number
  fallSpeedEnd: number
}

const cfg: Config = {
  cssHeight: 480,
  basketY: 420,
  basketH: 22,
  basketWStart: 120,
  basketWEnd: 90,
  roundSeconds: 60,
  lives: 3,
  spawnMsStart: 900,
  spawnMsEnd: 350,
  fallSpeedStart: 120,
  fallSpeedEnd: 320
}

const wrapperRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

const status = ref<Status>('ready')
const score = ref(0)
const lives = ref(cfg.lives)
const combo = ref(0)
const timeLeft = ref(cfg.roundSeconds)
const muted = ref(false)

const roundProgress = computed(() => {
  const t = 1 - timeLeft.value / cfg.roundSeconds
  return Math.max(0, Math.min(1, t))
})

let raf = 0
let lastTs = 0
let nextStarId = 1
let stars: Star[] = []

// Basket is in "CSS pixel" coordinates (our game coordinate system)
let basketX = 160 // center x

// Difficulty
let elapsed = 0
let spawnAccMs = 0

// Simple screen flash feedback
let flashMiss = 0 // 0..1
let flashCatch = 0 // 0..1

// --- Audio (WebAudio synth beeps) ---
let audioCtx: AudioContext | null = null

function ensureAudio() {
  if (muted.value) return
  if (audioCtx) return
  try {
    audioCtx = new AudioContext()
  } catch {
    audioCtx = null
  }
}

type OscType = 'sine' | 'square' | 'triangle' | 'sawtooth'

function beep(freq: number, ms: number, type: OscType = 'sine', gain = 0.05) {
  if (muted.value) return
  if (!audioCtx) return

  const now = audioCtx.currentTime
  const o = audioCtx.createOscillator()
  const g = audioCtx.createGain()

  o.type = type
  o.frequency.setValueAtTime(freq, now)

  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(gain, now + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000)

  o.connect(g)
  g.connect(audioCtx.destination)
  o.start(now)
  o.stop(now + ms / 1000 + 0.02)
}

function beepDown() {
  if (muted.value) return
  if (!audioCtx) return
  const now = audioCtx.currentTime

  const o = audioCtx.createOscillator()
  const g = audioCtx.createGain()
  o.type = 'triangle'
  o.frequency.setValueAtTime(440, now)
  o.frequency.exponentialRampToValueAtTime(220, now + 0.25)

  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(0.07, now + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28)

  o.connect(g)
  g.connect(audioCtx.destination)
  o.start(now)
  o.stop(now + 0.3)
}

// --- Helpers ---
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function easeIn(t: number) {
  return t * t
}

function currentSpawnMs() {
  return lerp(cfg.spawnMsStart, cfg.spawnMsEnd, easeIn(roundProgress.value))
}

function currentFallSpeed() {
  return lerp(cfg.fallSpeedStart, cfg.fallSpeedEnd, easeIn(roundProgress.value))
}

function currentBasketW() {
  return lerp(cfg.basketWStart, cfg.basketWEnd, roundProgress.value)
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v))
}

function resetGame() {
  status.value = 'ready'
  score.value = 0
  lives.value = cfg.lives
  combo.value = 0
  timeLeft.value = cfg.roundSeconds
  elapsed = 0
  spawnAccMs = 0
  stars = []
  flashMiss = 0
  flashCatch = 0
}

function startGame() {
  ensureAudio()
  beep(660, 50, 'sine', 0.05)
  status.value = 'playing'
  elapsed = 0
  spawnAccMs = 0
  stars = []
  combo.value = 0
  timeLeft.value = cfg.roundSeconds
}

function endGame() {
  status.value = 'gameover'
  beepDown()
}

function spawnStar(w: number) {
  const r = 10 + Math.random() * 6
  const x = r + Math.random() * (w - r * 2)
  const y = -r - 2
  const vy = currentFallSpeed()
  stars.push({ id: nextStarId++, x, y, r, vy })
}

function intersectsStarBasket(s: Star, wBasket: number) {
  const left = basketX - wBasket / 2
  const right = basketX + wBasket / 2
  const top = cfg.basketY
  const bottom = cfg.basketY + cfg.basketH

  // quick circle-in-rect check
  return s.x >= left - s.r && s.x <= right + s.r && s.y + s.r >= top && s.y - s.r <= bottom
}

function addScoreForCatch() {
  const bonus = Math.floor(combo.value / 5)
  score.value += 1 + bonus
}

function resizeCanvas() {
  const canvas = canvasRef.value
  const wrapper = wrapperRef.value
  if (!canvas || !wrapper) return

  const rect = wrapper.getBoundingClientRect()
  const cssW = Math.max(280, Math.floor(rect.width))
  const cssH = cfg.cssHeight

  const dpr = window.devicePixelRatio || 1
  canvas.style.width = `${cssW}px`
  canvas.style.height = `${cssH}px`
  canvas.width = Math.floor(cssW * dpr)
  canvas.height = Math.floor(cssH * dpr)

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  render(ctx, cssW, cssH)
}

function render(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // background gradient
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#0b1020')
  g.addColorStop(1, '#05060c')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  // subtle starfield
  ctx.globalAlpha = 0.35
  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < 35; i++) {
    const x = (i * 97) % w
    const y = (i * 151) % h
    ctx.fillRect(x, y, 2, 2)
  }
  ctx.globalAlpha = 1

  // miss/catch flash overlay
  if (flashMiss > 0) {
    ctx.fillStyle = `rgba(255,60,60,${0.18 * flashMiss})`
    ctx.fillRect(0, 0, w, h)
  }
  if (flashCatch > 0) {
    ctx.fillStyle = `rgba(80,200,255,${0.14 * flashCatch})`
    ctx.fillRect(0, 0, w, h)
  }

  // ground line
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.beginPath()
  ctx.moveTo(0, cfg.basketY + cfg.basketH + 10)
  ctx.lineTo(w, cfg.basketY + cfg.basketH + 10)
  ctx.stroke()

  // stars
  for (const s of stars) {
    // glow
    ctx.fillStyle = 'rgba(255, 235, 120, 0.2)'
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r * 1.8, 0, Math.PI * 2)
    ctx.fill()

    // core
    ctx.fillStyle = '#ffe66d'
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    ctx.fill()

    // highlight
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.beginPath()
    ctx.arc(s.x - s.r * 0.3, s.y - s.r * 0.3, Math.max(1.5, s.r * 0.22), 0, Math.PI * 2)
    ctx.fill()
  }

  // basket
  const bw = currentBasketW()
  const bx = basketX - bw / 2
  const by = cfg.basketY

  ctx.fillStyle = '#4aa3ff'
  const r = 10
  ctx.beginPath()
  ctx.moveTo(bx + r, by)
  ctx.arcTo(bx + bw, by, bx + bw, by + cfg.basketH, r)
  ctx.arcTo(bx + bw, by + cfg.basketH, bx, by + cfg.basketH, r)
  ctx.arcTo(bx, by + cfg.basketH, bx, by, r)
  ctx.arcTo(bx, by, bx + bw, by, r)
  ctx.closePath()
  ctx.fill()

  // HUD text
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.font = '16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
  ctx.fillText(`Score: ${score.value}`, 14, 26)
  ctx.fillText(`Lives: ${lives.value}`, 14, 48)
  ctx.fillText(`Time: ${Math.ceil(timeLeft.value)}s`, 14, 70)
  ctx.fillText(`Combo: ${combo.value}`, 14, 92)

  if (status.value === 'ready') {
    drawCenterText(ctx, w, h, 'Tap / Click to Start', '接住星星！')
  } else if (status.value === 'gameover') {
    drawCenterText(ctx, w, h, 'Game Over', 'Tap / Click to Restart')
  }
}

function drawCenterText(ctx: CanvasRenderingContext2D, w: number, h: number, title: string, subtitle: string) {
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.fillRect(0, h / 2 - 58, w, 116)

  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.font = '28px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(title, w / 2, h / 2 - 10)

  ctx.font = '16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fillText(subtitle, w / 2, h / 2 + 20)
  ctx.restore()
}

function loop(ts: number) {
  raf = requestAnimationFrame(loop)

  if (!lastTs) lastTs = ts
  const dt = Math.min(0.05, (ts - lastTs) / 1000)
  lastTs = ts

  const canvas = canvasRef.value
  const wrapper = wrapperRef.value
  if (!canvas || !wrapper) return

  const rect = wrapper.getBoundingClientRect()
  const w = Math.max(280, Math.floor(rect.width))
  const h = cfg.cssHeight

  // decay flashes
  flashMiss = Math.max(0, flashMiss - dt * 2.5)
  flashCatch = Math.max(0, flashCatch - dt * 3.2)

  if (status.value === 'playing') {
    elapsed += dt
    timeLeft.value = Math.max(0, cfg.roundSeconds - elapsed)

    // spawn
    spawnAccMs += dt * 1000
    const spawnMs = currentSpawnMs()
    while (spawnAccMs >= spawnMs) {
      spawnAccMs -= spawnMs
      spawnStar(w)
    }

    // update stars
    const bw = currentBasketW()
    for (const s of stars) {
      s.vy = currentFallSpeed()
      s.y += s.vy * dt
    }

    // collisions / misses
    const still: Star[] = []
    for (const s of stars) {
      if (intersectsStarBasket(s, bw)) {
        combo.value += 1
        addScoreForCatch()
        flashCatch = 1
        beep(880, 40, 'sine', 0.05)
        continue
      }

      if (s.y - s.r > h) {
        lives.value -= 1
        combo.value = 0
        flashMiss = 1
        beep(220, 60, 'square', 0.03)
        if (lives.value <= 0) {
          endGame()
        }
        continue
      }

      still.push(s)
    }
    stars = still

    if (timeLeft.value <= 0) {
      status.value = 'gameover'
      beepDown()
    }
  }

  // clamp basket
  const bw = currentBasketW()
  basketX = clamp(basketX, bw / 2, w - bw / 2)

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // keep dpr transform consistent even if layout changed
  const dpr = window.devicePixelRatio || 1
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  render(ctx, w, h)
}

function ensureLoopRunning() {
  if (raf) return
  lastTs = 0
  raf = requestAnimationFrame(loop)
}

function stopLoop() {
  if (raf) cancelAnimationFrame(raf)
  raf = 0
}

function setBasketFromClientX(clientX: number) {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  basketX = clamp(clientX - rect.left, 0, rect.width)
}

function onPointerMove(e: PointerEvent) {
  setBasketFromClientX(e.clientX)
}

function onPointerDown() {
  // first user gesture → enable audio on iOS
  ensureAudio()

  if (status.value === 'ready') startGame()
  else if (status.value === 'gameover') {
    resetGame()
    startGame()
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === ' ') {
    e.preventDefault()
    onPointerDown()
  }
  if (status.value !== 'playing') return

  const step = 24
  if (e.key === 'ArrowLeft') basketX -= step
  if (e.key === 'ArrowRight') basketX += step
}

function toggleMute() {
  muted.value = !muted.value
  if (muted.value) return
  ensureAudio()
}

onMounted(() => {
  resetGame()
  resizeCanvas()
  ensureLoopRunning()

  window.addEventListener('resize', resizeCanvas)
  window.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  stopLoop()
  window.removeEventListener('resize', resizeCanvas)
  window.removeEventListener('keydown', onKeyDown)

  try {
    audioCtx?.close()
  } catch {
    // ignore
  }
  audioCtx = null
})
</script>

<template>
  <div class="d-flex flex-column align-center" ref="wrapperRef">
    <div class="d-flex align-center justify-space-between w-100 mb-3" style="max-width: 920px">
      <div class="d-flex align-center ga-2 flex-wrap">
        <v-chip size="small" variant="tonal" color="primary">Score: {{ score }}</v-chip>
        <v-chip size="small" variant="tonal" color="primary">Lives: {{ lives }}</v-chip>
        <v-chip size="small" variant="tonal" color="primary">Time: {{ Math.ceil(timeLeft) }}s</v-chip>
        <v-chip size="small" variant="tonal" color="primary">Combo: {{ combo }}</v-chip>
      </div>

      <div class="d-flex align-center ga-2">
        <v-btn size="small" variant="tonal" @click="toggleMute">{{ muted ? 'Unmute' : 'Mute' }}</v-btn>
        <v-btn
          size="small"
          color="primary"
          variant="flat"
          :disabled="status === 'playing'"
          @click="onPointerDown"
        >
          {{ status === 'gameover' ? 'Restart' : 'Start' }}
        </v-btn>
      </div>
    </div>

    <canvas
      ref="canvasRef"
      class="star-catcher-canvas"
      tabindex="0"
      @pointermove="onPointerMove"
      @pointerdown="onPointerDown"
    />

    <div class="text-caption text-medium-emphasis mt-3" style="max-width: 920px">
      操作：滑鼠/觸控左右移動接星星。鍵盤：← →，空白鍵開始/重開。
    </div>
  </div>
</template>

<style scoped>
.star-catcher-canvas {
  touch-action: none;
  border-radius: 14px;
  outline: none;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}
</style>
