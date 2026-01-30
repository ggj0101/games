<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

type Status = 'ready' | 'playing' | 'gameover'

type JellyColorKey = 'red' | 'blue' | 'yellow' | 'green'

type Jelly = {
  id: number
  color: JellyColorKey
  x: number
  y: number
  r: number
  vx: number
  vy: number
}

type Config = {
  cssHeight: number
  roundSeconds: number
  lives: number
  jellyCountStart: number
  jellyCountEnd: number
  speedStart: number
  speedEnd: number
  rMin: number
  rMax: number
}

const cfg: Config = {
  cssHeight: 480,
  roundSeconds: 45,
  lives: 3,
  jellyCountStart: 6,
  jellyCountEnd: 10,
  speedStart: 35,
  speedEnd: 90,
  rMin: 22,
  rMax: 34
}

const COLORS: Record<JellyColorKey, { name: string; fill: string; glow: string; freq: number }> = {
  red: { name: '紅色', fill: '#ff4d6d', glow: 'rgba(255,77,109,0.22)', freq: 784 },
  blue: { name: '藍色', fill: '#4aa3ff', glow: 'rgba(74,163,255,0.22)', freq: 659 },
  yellow: { name: '黃色', fill: '#ffd166', glow: 'rgba(255,209,102,0.22)', freq: 880 },
  green: { name: '綠色', fill: '#4dde98', glow: 'rgba(77,222,152,0.22)', freq: 523 }
}

const colorKeys = Object.keys(COLORS) as JellyColorKey[]

const wrapperRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

const status = ref<Status>('ready')
const score = ref(0)
const lives = ref(cfg.lives)
const streak = ref(0)
const timeLeft = ref(cfg.roundSeconds)
const muted = ref(false)

const targetColor = ref<JellyColorKey>('red')

const roundProgress = computed(() => {
  const t = 1 - timeLeft.value / cfg.roundSeconds
  return Math.max(0, Math.min(1, t))
})

const targetText = computed(() => {
  const c = COLORS[targetColor.value]
  return `點 ${c.name}`
})

let raf = 0
let lastTs = 0
let elapsed = 0
let nextId = 1
let jellies: Jelly[] = []

// feedback flashes
let flashGood = 0
let flashBad = 0

// --- Audio (WebAudio synth) ---
let audioCtx: AudioContext | null = null

type OscType = 'sine' | 'square' | 'triangle' | 'sawtooth'

function ensureAudio() {
  if (muted.value) return
  if (audioCtx) return
  try {
    audioCtx = new AudioContext()
  } catch {
    audioCtx = null
  }
}

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

function sfxStart() {
  ensureAudio()
  beep(660, 50, 'sine', 0.05)
}

function sfxHit(c: JellyColorKey) {
  const f = COLORS[c].freq
  beep(f, 40, 'triangle', 0.05)
}

function sfxMilestone() {
  beep(784, 40, 'sine', 0.05)
  setTimeout(() => beep(988, 50, 'sine', 0.05), 45)
}

function sfxWrong() {
  if (muted.value || !audioCtx) return
  const now = audioCtx.currentTime
  const o = audioCtx.createOscillator()
  const g = audioCtx.createGain()

  o.type = 'triangle'
  o.frequency.setValueAtTime(330, now)
  o.frequency.exponentialRampToValueAtTime(165, now + 0.22)

  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(0.07, now + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.25)

  o.connect(g)
  g.connect(audioCtx.destination)
  o.start(now)
  o.stop(now + 0.28)
}

function sfxEnd() {
  // short sad-ish
  sfxWrong()
  setTimeout(() => beep(110, 120, 'square', 0.03), 120)
}

// --- helpers ---
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function easeIn(t: number) {
  return t * t
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v))
}

function randBetween(a: number, b: number) {
  return a + Math.random() * (b - a)
}

function currentSpeed() {
  return lerp(cfg.speedStart, cfg.speedEnd, easeIn(roundProgress.value))
}

function currentJellyCount() {
  return Math.round(lerp(cfg.jellyCountStart, cfg.jellyCountEnd, roundProgress.value))
}

function pickNextTarget(prev: JellyColorKey) {
  // avoid repeating the same too often
  let next = prev
  for (let i = 0; i < 6 && next === prev; i++) {
    next = colorKeys[Math.floor(Math.random() * colorKeys.length)]!
  }
  return next
}

function resetGame() {
  status.value = 'ready'
  score.value = 0
  lives.value = cfg.lives
  streak.value = 0
  timeLeft.value = cfg.roundSeconds
  elapsed = 0
  jellies = []
  nextId = 1
  targetColor.value = pickNextTarget('red')
  flashGood = 0
  flashBad = 0
}

function startGame() {
  sfxStart()
  status.value = 'playing'
  score.value = 0
  lives.value = cfg.lives
  streak.value = 0
  timeLeft.value = cfg.roundSeconds
  elapsed = 0
  jellies = []
  nextId = 1
  targetColor.value = pickNextTarget(targetColor.value)

  // spawn initial set based on current count
  const wrapper = wrapperRef.value
  if (wrapper) {
    const rect = wrapper.getBoundingClientRect()
    const w = Math.max(280, Math.floor(rect.width))
    const h = cfg.cssHeight
    const count = currentJellyCount()
    for (let i = 0; i < count; i++) {
      jellies.push(makeJelly(w, h))
    }
  }
}

function endGame() {
  status.value = 'gameover'
  sfxEnd()
}

function makeJelly(w: number, h: number): Jelly {
  const r = randBetween(cfg.rMin, cfg.rMax)
  const x = r + Math.random() * (w - r * 2)
  const y = 90 + r + Math.random() * (h - (90 + r) - r)

  const speed = currentSpeed()
  const a = Math.random() * Math.PI * 2
  const vx = Math.cos(a) * speed
  const vy = Math.sin(a) * speed

  const color = colorKeys[Math.floor(Math.random() * colorKeys.length)]!
  return { id: nextId++, color, x, y, r, vx, vy }
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

function renderJelly(ctx: CanvasRenderingContext2D, j: Jelly) {
  const c = COLORS[j.color]

  // glow
  ctx.fillStyle = c.glow
  ctx.beginPath()
  ctx.arc(j.x, j.y, j.r * 1.85, 0, Math.PI * 2)
  ctx.fill()

  // body (simple radial gradient)
  const g = ctx.createRadialGradient(j.x - j.r * 0.35, j.y - j.r * 0.35, 2, j.x, j.y, j.r)
  g.addColorStop(0, 'rgba(255,255,255,0.90)')
  g.addColorStop(0.18, c.fill)
  g.addColorStop(1, 'rgba(0,0,0,0.10)')

  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(j.x, j.y, j.r, 0, Math.PI * 2)
  ctx.fill()

  // highlight
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.beginPath()
  ctx.arc(j.x - j.r * 0.28, j.y - j.r * 0.28, Math.max(3, j.r * 0.18), 0, Math.PI * 2)
  ctx.fill()
}

function render(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // background
  const bg = ctx.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, '#0b1020')
  bg.addColorStop(1, '#05060c')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  // feedback flash
  if (flashGood > 0) {
    ctx.fillStyle = `rgba(80,200,255,${0.14 * flashGood})`
    ctx.fillRect(0, 0, w, h)
  }
  if (flashBad > 0) {
    ctx.fillStyle = `rgba(255,60,60,${0.16 * flashBad})`
    ctx.fillRect(0, 0, w, h)
  }

  // playfield top divider
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.beginPath()
  ctx.moveTo(0, 86)
  ctx.lineTo(w, 86)
  ctx.stroke()

  // jellies
  for (const j of jellies) renderJelly(ctx, j)

  // HUD
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.font = '16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
  ctx.fillText(`Score: ${score.value}`, 14, 26)
  ctx.fillText(`Lives: ${lives.value}`, 14, 48)
  ctx.fillText(`Time: ${Math.ceil(timeLeft.value)}s`, 14, 70)

  ctx.textAlign = 'right'
  ctx.fillText(`Streak: ${streak.value}`, w - 14, 26)

  // target
  ctx.textAlign = 'center'
  ctx.font = '18px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
  const tc = COLORS[targetColor.value]
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.fillText('目標', w / 2, 28)
  ctx.fillStyle = tc.fill
  ctx.fillText(tc.name, w / 2, 54)

  // overlays
  if (status.value === 'ready') {
    drawCenterText(ctx, w, h, 'Tap to Start', '點指定顏色的果凍！')
  }
  if (status.value === 'gameover') {
    drawCenterText(ctx, w, h, 'Game Over', 'Tap / Click to Restart')
  }

  ctx.textAlign = 'left'
}

function drawCenterText(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  title: string,
  subtitle: string
) {
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.fillRect(0, h / 2 - 58, w, 116)

  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.font = '28px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(title, w / 2, h / 2 - 10)

  ctx.font = '15px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fillText(subtitle, w / 2, h / 2 + 20)
  ctx.restore()
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
  flashGood = Math.max(0, flashGood - dt * 3.2)
  flashBad = Math.max(0, flashBad - dt * 2.8)

  if (status.value === 'playing') {
    elapsed += dt
    timeLeft.value = Math.max(0, cfg.roundSeconds - elapsed)

    // adjust jelly count over time (add if needed)
    const want = currentJellyCount()
    while (jellies.length < want) jellies.push(makeJelly(w, h))

    // move
    const speedMul = currentSpeed() / cfg.speedStart
    for (const j of jellies) {
      j.x += j.vx * dt * speedMul
      j.y += j.vy * dt * speedMul

      // bounce inside playfield (below HUD divider)
      const top = 86 + j.r + 6
      const bottom = h - j.r - 10
      const left = j.r + 10
      const right = w - j.r - 10

      if (j.x < left) {
        j.x = left
        j.vx = Math.abs(j.vx)
      }
      if (j.x > right) {
        j.x = right
        j.vx = -Math.abs(j.vx)
      }
      if (j.y < top) {
        j.y = top
        j.vy = Math.abs(j.vy)
      }
      if (j.y > bottom) {
        j.y = bottom
        j.vy = -Math.abs(j.vy)
      }
    }

    if (timeLeft.value <= 0) {
      endGame()
    }
  }

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  render(ctx, w, h)
}

function distance(x1: number, y1: number, x2: number, y2: number) {
  const dx = x1 - x2
  const dy = y1 - y2
  return Math.sqrt(dx * dx + dy * dy)
}

function clientToCanvasXY(clientX: number, clientY: number) {
  const canvas = canvasRef.value
  if (!canvas) return { x: 0, y: 0 }
  const rect = canvas.getBoundingClientRect()
  return { x: clientX - rect.left, y: clientY - rect.top }
}

function pickJellyAt(x: number, y: number) {
  for (let i = jellies.length - 1; i >= 0; i--) {
    const j = jellies[i]
    if (!j) continue
    if (distance(x, y, j.x, j.y) <= j.r) return j
  }
  return null
}

function addScore() {
  const bonus = Math.min(4, Math.floor(streak.value / 5))
  score.value += 1 + bonus
}

function onPointerDown(e: PointerEvent) {
  e.preventDefault()
  ensureAudio()

  const { x, y } = clientToCanvasXY(e.clientX, e.clientY)

  if (status.value === 'ready') {
    startGame()
    return
  }
  if (status.value === 'gameover') {
    resetGame()
    startGame()
    return
  }
  if (status.value !== 'playing') return

  const j = pickJellyAt(x, y)
  if (!j) return // no penalty for tapping empty

  if (j.color === targetColor.value) {
    streak.value += 1
    addScore()
    flashGood = 1
    sfxHit(j.color)

    if (streak.value > 0 && streak.value % 10 === 0) {
      sfxMilestone()
    }

    targetColor.value = pickNextTarget(targetColor.value)

    // tiny reposition to reduce accidental double hits
    j.x = clamp(j.x + randBetween(-12, 12), j.r + 10, (wrapperRef.value?.getBoundingClientRect().width ?? 320) - j.r - 10)
    j.y = clamp(j.y + randBetween(-10, 10), 86 + j.r + 6, cfg.cssHeight - j.r - 10)
  } else {
    lives.value -= 1
    streak.value = 0
    flashBad = 1
    sfxWrong()

    if (lives.value <= 0) endGame()
  }
}

function toggleMute() {
  muted.value = !muted.value
  if (!muted.value) ensureAudio()
}

function onStartButton() {
  ensureAudio()
  if (status.value === 'ready') startGame()
  else if (status.value === 'gameover') {
    resetGame()
    startGame()
  }
}

onMounted(() => {
  resetGame()
  resizeCanvas()
  ensureLoopRunning()
  window.addEventListener('resize', resizeCanvas)
})

onBeforeUnmount(() => {
  stopLoop()
  window.removeEventListener('resize', resizeCanvas)
  try {
    audioCtx?.close()
  } catch {
    // ignore
  }
  audioCtx = null
})
</script>

<template>
  <div class="jelly-root d-flex flex-column align-center" ref="wrapperRef">
    <div class="d-flex align-center justify-space-between w-100 mb-3" style="max-width: 920px">
      <div class="d-flex align-center ga-2 flex-wrap">
        <v-chip size="small" variant="tonal" color="primary">Score: {{ score }}</v-chip>
        <v-chip size="small" variant="tonal" color="primary">Lives: {{ lives }}</v-chip>
        <v-chip size="small" variant="tonal" color="primary">Time: {{ Math.ceil(timeLeft) }}s</v-chip>
        <v-chip size="small" variant="tonal" color="primary">Streak: {{ streak }}</v-chip>
        <v-chip size="small" variant="flat" color="deep-purple">{{ targetText }}</v-chip>
      </div>

      <div class="d-flex align-center ga-2">
        <v-btn size="small" variant="tonal" @click="toggleMute">{{ muted ? 'Unmute' : 'Mute' }}</v-btn>
        <v-btn
          size="small"
          color="primary"
          variant="flat"
          :disabled="status === 'playing'"
          @click="onStartButton"
        >
          {{ status === 'gameover' ? 'Restart' : 'Start' }}
        </v-btn>
      </div>
    </div>

    <canvas
      ref="canvasRef"
      class="jelly-canvas"
      tabindex="0"
      @pointerdown.prevent="onPointerDown"
    />

    <div class="text-caption text-medium-emphasis mt-3" style="max-width: 920px">
      操作：看上方目標顏色，點同色果凍得分；點錯扣生命。點空白不會扣血。
    </div>
  </div>
</template>

<style scoped>
.jelly-root {
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.jelly-canvas {
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  border-radius: 14px;
  outline: none;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}
</style>
