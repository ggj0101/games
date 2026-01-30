<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

type StarKind = 'small' | 'big' | 'buff' | 'debuff'

type Star = {
  id: number
  kind: StarKind
  x: number
  y: number
  r: number // rendered radius (CSS px)
  rMax?: number
  rMin?: number
  vy: number // px/s
  hp?: number // 0..1 for big
}

type Status = 'ready' | 'playing' | 'gameover'

type Config = {
  cssHeight: number
  roundSeconds: number
  lives: number
  spawnMsStart: number
  spawnMsEnd: number
  fallSpeedStart: number
  fallSpeedEnd: number
  bigRatioStart: number
  bigRatioEnd: number
  bigHoldSeconds: number // ~0.9s to clear
  bigHitPadding: number // +10px
  comboWindowSeconds: number
  magnetSeconds: number
  stickySeconds: number
  magnetHitBonus: number
  stickyBurnMul: number
  powerupEveryMsMin: number
  powerupEveryMsMax: number
  powerupBuffChance: number
}

const cfg: Config = {
  cssHeight: 480,
  roundSeconds: 60,
  lives: 3,
  spawnMsStart: 900,
  spawnMsEnd: 350,
  fallSpeedStart: 120,
  fallSpeedEnd: 320,
  bigRatioStart: 0.2,
  bigRatioEnd: 0.45,
  bigHoldSeconds: 0.9,
  bigHitPadding: 10,
  comboWindowSeconds: 1.2,
  magnetSeconds: 3,
  stickySeconds: 3,
  magnetHitBonus: 12,
  stickyBurnMul: 0.6,
  powerupEveryMsMin: 6000,
  powerupEveryMsMax: 10000,
  powerupBuffChance: 0.7
}

const wrapperRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

const status = ref<Status>('ready')
const score = ref(0)
const lives = ref(cfg.lives)
const combo = ref(0)
const timeLeft = ref(cfg.roundSeconds)
const muted = ref(false)

// Timed effects
const magnetLeft = ref(0) // seconds
const stickyLeft = ref(0) // seconds

const roundProgress = computed(() => {
  const t = 1 - timeLeft.value / cfg.roundSeconds
  return Math.max(0, Math.min(1, t))
})

const magnetOn = computed(() => magnetLeft.value > 0)
const stickyOn = computed(() => stickyLeft.value > 0)

let raf = 0
let lastTs = 0
let nextStarId = 1
let stars: Star[] = []

// Difficulty
let elapsed = 0
let spawnAccMs = 0
let powerupAccMs = 0
let nextPowerupMs = 8000

// Combo timing
let comboLeft = 0

// Pointer hold state (single pointer MVP)
let activePointerId: number | null = null
let activeStarId: number | null = null
let pointerDown = false
let pointerX = 0
let pointerY = 0

// Simple screen flash feedback
let flashMiss = 0 // 0..1
let flashClear = 0 // 0..1

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

function sfxStart() {
  ensureAudio()
  beep(660, 50, 'sine', 0.05)
}

function sfxTapClear() {
  beep(880, 40, 'sine', 0.05)
}

function sfxHoldClear() {
  // bright two-tone
  beep(660, 35, 'triangle', 0.05)
  setTimeout(() => beep(990, 45, 'triangle', 0.05), 40)
}

function sfxMissBig() {
  beep(220, 70, 'square', 0.03)
}

function sfxBuffOn() {
  beep(784, 60, 'sine', 0.05)
}

function sfxDebuffOn() {
  beep(196, 80, 'triangle', 0.05)
}

// --- Helpers ---
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

function currentSpawnMs() {
  return lerp(cfg.spawnMsStart, cfg.spawnMsEnd, easeIn(roundProgress.value))
}

function currentFallSpeed() {
  return lerp(cfg.fallSpeedStart, cfg.fallSpeedEnd, easeIn(roundProgress.value))
}

function currentBigRatio() {
  return lerp(cfg.bigRatioStart, cfg.bigRatioEnd, roundProgress.value)
}

function hitBonus() {
  return (magnetOn.value ? cfg.magnetHitBonus : 0)
}

function currentBurnRate() {
  const base = 1 / cfg.bigHoldSeconds // hp per second
  return base * (stickyOn.value ? cfg.stickyBurnMul : 1)
}

function resetGame() {
  status.value = 'ready'
  score.value = 0
  lives.value = cfg.lives
  combo.value = 0
  comboLeft = 0
  timeLeft.value = cfg.roundSeconds
  elapsed = 0
  spawnAccMs = 0
  powerupAccMs = 0
  nextPowerupMs = randBetween(cfg.powerupEveryMsMin, cfg.powerupEveryMsMax)
  stars = []
  magnetLeft.value = 0
  stickyLeft.value = 0
  flashMiss = 0
  flashClear = 0
  activePointerId = null
  activeStarId = null
  pointerDown = false
}

function startGame() {
  sfxStart()
  status.value = 'playing'
  elapsed = 0
  spawnAccMs = 0
  powerupAccMs = 0
  nextPowerupMs = randBetween(cfg.powerupEveryMsMin, cfg.powerupEveryMsMax)
  stars = []
  combo.value = 0
  comboLeft = 0
  timeLeft.value = cfg.roundSeconds
  lives.value = cfg.lives
  magnetLeft.value = 0
  stickyLeft.value = 0
}

function endGame() {
  status.value = 'gameover'
  beepDown()
}

function spawnStar(w: number) {
  const isBig = Math.random() < currentBigRatio()

  if (isBig) {
    const rMax = 26
    const rMin = 10
    const r = rMax
    const x = r + Math.random() * (w - r * 2)
    const y = -r - 2
    const vy = currentFallSpeed()
    stars.push({ id: nextStarId++, kind: 'big', x, y, r, rMax, rMin, vy, hp: 1 })
    return
  }

  const r = 10 + Math.random() * 4
  const x = r + Math.random() * (w - r * 2)
  const y = -r - 2
  const vy = currentFallSpeed()
  stars.push({ id: nextStarId++, kind: 'small', x, y, r, vy })
}

function spawnPowerup(w: number) {
  const isBuff = Math.random() < cfg.powerupBuffChance
  const kind: StarKind = isBuff ? 'buff' : 'debuff'
  const r = 14
  const x = r + Math.random() * (w - r * 2)
  const y = -r - 2
  const vy = currentFallSpeed() * 0.9
  stars.push({ id: nextStarId++, kind, x, y, r, vy })
}

function distance(x1: number, y1: number, x2: number, y2: number) {
  const dx = x1 - x2
  const dy = y1 - y2
  return Math.sqrt(dx * dx + dy * dy)
}

function hitRadiusForStar(s: Star) {
  if (s.kind === 'big') return (s.r || 0) + cfg.bigHitPadding + hitBonus()
  if (s.kind === 'buff' || s.kind === 'debuff') return s.r + 8 + hitBonus()
  return s.r + hitBonus()
}

function pickStarAt(x: number, y: number) {
  // pick topmost (last drawn) by scanning from end
  for (let i = stars.length - 1; i >= 0; i--) {
    const s = stars[i]
    if (!s) continue
    const hr = hitRadiusForStar(s)
    if (distance(x, y, s.x, s.y) <= hr) return s
  }
  return null
}

function clearStar(s: Star, reason: 'tap' | 'hold' | 'powerup') {
  if (reason === 'tap') sfxTapClear()
  if (reason === 'hold') sfxHoldClear()

  if (s.kind === 'small') {
    addScore(1)
  } else if (s.kind === 'big') {
    addScore(3)
  } else if (s.kind === 'buff') {
    magnetLeft.value = cfg.magnetSeconds
    sfxBuffOn()
  } else if (s.kind === 'debuff') {
    stickyLeft.value = cfg.stickySeconds
    sfxDebuffOn()
  }

  // Combo grows on clearing stars (not on powerups)
  if (s.kind === 'small' || s.kind === 'big') {
    combo.value += 1
    comboLeft = cfg.comboWindowSeconds
  }

  flashClear = 1

  // remove from list
  stars = stars.filter((x) => x.id !== s.id)

  // If we were holding it, clear hold state
  if (activeStarId === s.id) {
    activeStarId = null
  }
}

function addScore(base: number) {
  const bonus = Math.min(5, Math.floor(combo.value / 5))
  score.value += base + bonus
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

  // miss/clear flash overlay
  if (flashMiss > 0) {
    ctx.fillStyle = `rgba(255,60,60,${0.18 * flashMiss})`
    ctx.fillRect(0, 0, w, h)
  }
  if (flashClear > 0) {
    ctx.fillStyle = `rgba(80,200,255,${0.14 * flashClear})`
    ctx.fillRect(0, 0, w, h)
  }

  // ground line
  const groundY = h - 24
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.beginPath()
  ctx.moveTo(0, groundY)
  ctx.lineTo(w, groundY)
  ctx.stroke()

  // active effect hints
  if (magnetOn.value) {
    ctx.strokeStyle = 'rgba(90,190,255,0.35)'
    ctx.lineWidth = 6
    ctx.strokeRect(6, 6, w - 12, h - 12)
    ctx.lineWidth = 1
  }
  if (stickyOn.value) {
    ctx.fillStyle = 'rgba(190,120,255,0.10)'
    ctx.fillRect(0, 0, w, h)
  }

  // stars
  for (const s of stars) {
    if (s.kind === 'buff') {
      // Magnet buff icon
      ctx.fillStyle = 'rgba(80,160,255,0.25)'
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.r * 1.8, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#4aa3ff'
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
      ctx.fill()

      ctx.strokeStyle = 'rgba(255,255,255,0.8)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(s.x - 4, s.y, 5, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(s.x + 4, s.y, 5, 0, Math.PI * 2)
      ctx.stroke()
      ctx.lineWidth = 1
      continue
    }

    if (s.kind === 'debuff') {
      // Sticky debuff icon
      ctx.fillStyle = 'rgba(190,120,255,0.2)'
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.r * 1.8, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#b97aff'
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.beginPath()
      ctx.arc(s.x - 4, s.y - 2, 2.2, 0, Math.PI * 2)
      ctx.arc(s.x + 3, s.y + 1, 2.6, 0, Math.PI * 2)
      ctx.fill()
      continue
    }

    // glow
    ctx.fillStyle = s.kind === 'big' ? 'rgba(255, 190, 90, 0.18)' : 'rgba(255, 235, 120, 0.2)'
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r * 1.8, 0, Math.PI * 2)
    ctx.fill()

    // core
    ctx.fillStyle = s.kind === 'big' ? '#ffb84a' : '#ffe66d'
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    ctx.fill()

    // highlight
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.beginPath()
    ctx.arc(s.x - s.r * 0.3, s.y - s.r * 0.3, Math.max(1.5, s.r * 0.22), 0, Math.PI * 2)
    ctx.fill()

    // big star progress ring
    if (s.kind === 'big' && typeof s.hp === 'number') {
      const p = clamp(1 - s.hp, 0, 1)
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(s.x, s.y, Math.max(s.r + 6, 14), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p)
      ctx.stroke()
      ctx.lineWidth = 1
    }
  }

  // HUD text (inside canvas)
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.font = '16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
  ctx.fillText(`Score: ${score.value}`, 14, 26)
  ctx.fillText(`Lives: ${lives.value}`, 14, 48)
  ctx.fillText(`Time: ${Math.ceil(timeLeft.value)}s`, 14, 70)
  ctx.fillText(`Combo: ${combo.value}`, 14, 92)

  if (magnetOn.value) ctx.fillText(`Magnet: ${Math.ceil(magnetLeft.value)}s`, 14, 114)
  if (stickyOn.value) ctx.fillText(`Sticky: ${Math.ceil(stickyLeft.value)}s`, 14, magnetOn.value ? 136 : 114)

  if (status.value === 'ready') {
    drawCenterText(ctx, w, h, 'Tap to Start', '點星星消除（大星可長按分段磨掉）')
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

  ctx.font = '15px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fillText(subtitle, w / 2, h / 2 + 20)
  ctx.restore()
}

function updateHoldDamage(dt: number) {
  if (!pointerDown) return
  if (activePointerId == null || activeStarId == null) return

  const s = stars.find((x) => x.id === activeStarId)
  if (!s || s.kind !== 'big' || typeof s.hp !== 'number') return

  const hr = hitRadiusForStar(s)
  const inHit = distance(pointerX, pointerY, s.x, s.y) <= hr
  if (!inHit) return

  s.hp = clamp(s.hp - currentBurnRate() * dt, 0, 1)

  // update radius to visualize progress
  const rMax = s.rMax ?? 26
  const rMin = s.rMin ?? 10
  s.r = rMin + (rMax - rMin) * s.hp

  if (s.hp <= 0) {
    clearStar(s, 'hold')
  }
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
  const groundY = h - 24

  // decay flashes
  flashMiss = Math.max(0, flashMiss - dt * 2.5)
  flashClear = Math.max(0, flashClear - dt * 3.2)

  // effects countdown
  magnetLeft.value = Math.max(0, magnetLeft.value - dt)
  stickyLeft.value = Math.max(0, stickyLeft.value - dt)

  // combo countdown
  if (comboLeft > 0) {
    comboLeft = Math.max(0, comboLeft - dt)
    if (comboLeft === 0) combo.value = 0
  }

  if (status.value === 'playing') {
    elapsed += dt
    timeLeft.value = Math.max(0, cfg.roundSeconds - elapsed)

    // spawn stars
    spawnAccMs += dt * 1000
    const spawnMs = currentSpawnMs()
    while (spawnAccMs >= spawnMs) {
      spawnAccMs -= spawnMs
      spawnStar(w)
    }

    // spawn powerups occasionally
    powerupAccMs += dt * 1000
    if (powerupAccMs >= nextPowerupMs) {
      powerupAccMs = 0
      nextPowerupMs = randBetween(cfg.powerupEveryMsMin, cfg.powerupEveryMsMax)
      spawnPowerup(w)
    }

    // update stars
    for (const s of stars) {
      s.vy = currentFallSpeed()
      s.y += s.vy * dt
    }

    // apply hold damage
    updateHoldDamage(dt)

    // misses (only big costs lives)
    const still: Star[] = []
    for (const s of stars) {
      if (s.y - s.r > groundY) {
        if (s.kind === 'big') {
          lives.value -= 1
          combo.value = 0
          comboLeft = 0
          flashMiss = 1
          sfxMissBig()
          if (lives.value <= 0) {
            endGame()
          }
        }
        // small/powerups just disappear on ground
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

function clientToCanvasXY(clientX: number, clientY: number) {
  const canvas = canvasRef.value
  if (!canvas) return { x: 0, y: 0 }
  const rect = canvas.getBoundingClientRect()
  return {
    x: clientX - rect.left,
    y: clientY - rect.top
  }
}

function onPointerDown(e: PointerEvent) {
  // first user gesture → enable audio on iOS
  ensureAudio()

  const { x, y } = clientToCanvasXY(e.clientX, e.clientY)
  pointerX = x
  pointerY = y
  pointerDown = true

  // Start/restart on tap
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

  // Interaction
  const s = pickStarAt(x, y)
  if (!s) return

  // capture pointer so we still receive up/cancel
  try {
    canvasRef.value?.setPointerCapture(e.pointerId)
  } catch {
    // ignore
  }

  if (s.kind === 'small') {
    clearStar(s, 'tap')
    return
  }

  if (s.kind === 'buff' || s.kind === 'debuff') {
    clearStar(s, 'powerup')
    return
  }

  // big: start holding
  activePointerId = e.pointerId
  activeStarId = s.id
}

function onPointerMove(e: PointerEvent) {
  const { x, y } = clientToCanvasXY(e.clientX, e.clientY)
  pointerX = x
  pointerY = y
}

function onPointerUp(e: PointerEvent) {
  pointerDown = false
  if (activePointerId === e.pointerId) {
    activePointerId = null
    activeStarId = null
  }
}

function onPointerCancel(e: PointerEvent) {
  onPointerUp(e)
}

function toggleMute() {
  muted.value = !muted.value
  if (muted.value) return
  ensureAudio()
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
  <div class="d-flex flex-column align-center" ref="wrapperRef">
    <div class="d-flex align-center justify-space-between w-100 mb-3" style="max-width: 920px">
      <div class="d-flex align-center ga-2 flex-wrap">
        <v-chip size="small" variant="tonal" color="primary">Score: {{ score }}</v-chip>
        <v-chip size="small" variant="tonal" color="primary">Lives: {{ lives }}</v-chip>
        <v-chip size="small" variant="tonal" color="primary">Time: {{ Math.ceil(timeLeft) }}s</v-chip>
        <v-chip size="small" variant="tonal" color="primary">Combo: {{ combo }}</v-chip>
        <v-chip v-if="magnetOn" size="small" variant="tonal" color="info">Magnet {{ Math.ceil(magnetLeft) }}s</v-chip>
        <v-chip v-if="stickyOn" size="small" variant="tonal" color="deep-purple">Sticky {{ Math.ceil(stickyLeft) }}s</v-chip>
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
      class="star-catcher-canvas"
      tabindex="0"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
    />

    <div class="text-caption text-medium-emphasis mt-3" style="max-width: 920px">
      操作：點小星星會消除；大星星可長按（可分段）磨到變小消失。磁鐵 Buff 會更好點；黏黏 Debuff 會讓大星更難磨。
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
