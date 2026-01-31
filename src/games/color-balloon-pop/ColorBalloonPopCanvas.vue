<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

type Status = 'ready' | 'playing' | 'gameover'

type Balloon = {
  id: number
  colorKey: ColorKey
  r: number
  vx: number
  vy: number
  alpha: number
  g: any
}

type Particle = {
  id: number
  life: number
  vx: number
  vy: number
  g: any
}

type ColorKey = 'red' | 'blue' | 'yellow' | 'green' | 'purple'

const COLORS: Record<ColorKey, { nameZh: string; hex: number }> = {
  red: { nameZh: '紅', hex: 0xff4d4d },
  blue: { nameZh: '藍', hex: 0x4aa3ff },
  yellow: { nameZh: '黃', hex: 0xffe066 },
  green: { nameZh: '綠', hex: 0x44d17a },
  purple: { nameZh: '紫', hex: 0xb97aff }
}

const cfg = {
  cssHeight: 520,
  roundSeconds: 60,
  lives: 3,
  // spawn interval will lerp from start -> end
  spawnMsStart: 820,
  spawnMsEnd: 300,
  // balloon speed (px/s)
  riseSpeedStart: 70,
  riseSpeedEnd: 190,
  // max balloons on screen
  maxBalloons: 18,
  // target change
  changeEveryPoints: 15,
  changeEveryHits: 5
}

const mountRef = ref<HTMLDivElement | null>(null)

const status = ref<Status>('ready')
const score = ref(0)
const combo = ref(0)
const lives = ref(cfg.lives)
const timeLeft = ref(cfg.roundSeconds)
const muted = ref(false)

const target = ref<ColorKey>('red')
const targetFlash = ref(0) // seconds

const targetLabel = computed(() => COLORS[target.value].nameZh)

let destroyFn: (() => void) | null = null

// --- Audio (WebAudio synth) ---
let audioCtx: AudioContext | null = null

async function ensureAudio() {
  if (muted.value) return
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
    if (audioCtx.state === 'suspended') await audioCtx.resume()
  } catch {
    // ignore
  }
}

type OscType = 'sine' | 'square' | 'triangle' | 'sawtooth'

function tone(freq: number, ms: number, type: OscType, gain = 0.06) {
  if (muted.value || !audioCtx || audioCtx.state !== 'running') return

  const t0 = audioCtx.currentTime
  const osc = audioCtx.createOscillator()
  const g = audioCtx.createGain()

  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)

  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000)

  osc.connect(g)
  g.connect(audioCtx.destination)

  osc.start(t0)
  osc.stop(t0 + ms / 1000 + 0.02)
}

function sfxStart() {
  tone(660, 60, 'sine', 0.05)
}

function sfxPop() {
  tone(920, 45, 'triangle', 0.06)
}

function sfxWrong() {
  tone(220, 90, 'square', 0.035)
}

function sfxChange() {
  tone(523, 60, 'sine', 0.05)
  setTimeout(() => tone(784, 70, 'sine', 0.05), 70)
}

function sfxGameOver() {
  tone(392, 70, 'triangle', 0.05)
  setTimeout(() => tone(262, 120, 'triangle', 0.05), 80)
}

// --- Helpers ---
function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function easeIn(t: number) {
  return t * t
}

function pick<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)]!
}

function paletteByProgress(p: number): ColorKey[] {
  if (p < 0.25) return ['red', 'blue', 'yellow']
  if (p < 0.66) return ['red', 'blue', 'yellow', 'green']
  return ['red', 'blue', 'yellow', 'green', 'purple']
}

function comboBonus(c: number) {
  // every +5 hits adds +1, up to +3
  return Math.min(3, Math.floor(c / 5))
}

function nextTarget(palette: ColorKey[], current: ColorKey) {
  const options = palette.filter((c) => c !== current)
  return options.length ? pick(options) : current
}

onMounted(async () => {
  const el = mountRef.value
  if (!el) return

  const PIXI = await import('pixi.js')

  const app = new PIXI.Application()
  await app.init({
    resizeTo: el,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(2, window.devicePixelRatio || 1)
  })

  // fixed CSS height (width is responsive)
  el.style.height = `${cfg.cssHeight}px`
  el.appendChild(app.canvas)

  const stage = app.stage

  // Layers
  const bg = new PIXI.Graphics()
  const balloonLayer = new PIXI.Container()
  const particleLayer = new PIXI.Container()
  const overlay = new PIXI.Graphics()

  stage.addChild(bg)
  stage.addChild(balloonLayer)
  stage.addChild(particleLayer)
  stage.addChild(overlay)

  overlay.eventMode = 'static'
  overlay.cursor = 'pointer'

  let nextBalloonId = 1
  let nextParticleId = 1

  let balloons: Balloon[] = []
  let particles: Particle[] = []

  let elapsed = 0
  let spawnAcc = 0
  let hitsSinceChange = 0
  let missFlash = 0 // 0..1

  function resetGame() {
    status.value = 'ready'
    score.value = 0
    combo.value = 0
    lives.value = cfg.lives
    timeLeft.value = cfg.roundSeconds
    target.value = 'red'
    targetFlash.value = 0

    elapsed = 0
    spawnAcc = 0
    hitsSinceChange = 0
    missFlash = 0

    for (const b of balloons) b.g?.destroy?.()
    balloons = []

    for (const p of particles) p.g?.destroy?.()
    particles = []

    balloonLayer.removeChildren()
    particleLayer.removeChildren()
  }

  function progress01() {
    return clamp(elapsed / cfg.roundSeconds, 0, 1)
  }

  function currentSpawnMs() {
    return lerp(cfg.spawnMsStart, cfg.spawnMsEnd, easeIn(progress01()))
  }

  function currentRiseSpeed() {
    return lerp(cfg.riseSpeedStart, cfg.riseSpeedEnd, easeIn(progress01()))
  }

  function spawnBalloon() {
    if (balloons.length >= cfg.maxBalloons) return

    const w = app.renderer.width
    const h = app.renderer.height

    const p = progress01()
    const palette = paletteByProgress(p)
    const colorKey = pick(palette)

    // smaller balloons late game
    const rBase = 28
    const r = clamp(rBase - p * 8 + (Math.random() * 6 - 3), 18, 34)
    const x = r + Math.random() * (w - r * 2)
    const y = h + r + 6

    const vy = -(currentRiseSpeed() * (0.85 + Math.random() * 0.35))
    const vx = (Math.random() * 2 - 1) * 18
    const alpha = p > 0.66 && Math.random() < 0.25 ? 0.72 : 1

    const g = new PIXI.Graphics()
    drawBalloon(g, COLORS[colorKey].hex, r)
    g.position.set(x, y)
    g.alpha = alpha
    g.eventMode = 'static'
    g.cursor = 'pointer'

    // slightly generous hit area
    g.hitArea = new PIXI.Circle(0, 0, r * 1.08)

    const id = nextBalloonId++

    g.on('pointertap', async () => {
      await ensureAudio()

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

      const b = balloons.find((x) => x.id === id)
      if (!b) return

      onPop(b)
    })

    balloonLayer.addChild(g)
    balloons.push({ id, colorKey, r, vx, vy, alpha, g })
  }

  function drawBalloon(g: any, hex: number, r: number) {
    g.clear()

    // body
    g.ellipse(0, 0, r * 0.88, r).fill({ color: hex, alpha: 1 })

    // highlight
    g.ellipse(-r * 0.22, -r * 0.2, r * 0.22, r * 0.34).fill({
      color: 0xffffff,
      alpha: 0.35
    })

    // knot
    g.roundRect(-r * 0.1, r * 0.92, r * 0.2, r * 0.18, 2).fill({ color: 0x111111, alpha: 0.22 })

    // string
    g.setStrokeStyle({ width: 2, color: 0xffffff, alpha: 0.22 })
    g.moveTo(0, r * 1.08)
    g.bezierCurveTo(-r * 0.25, r * 1.35, r * 0.2, r * 1.55, 0, r * 1.8)
    g.stroke()
  }

  function spawnPopParticles(x: number, y: number, colorHex: number) {
    const count = 10

    for (let i = 0; i < count; i++) {
      const gg = new PIXI.Graphics()

      const size = 3 + Math.random() * 3
      const isRect = Math.random() < 0.6
      if (isRect) gg.rect(-size / 2, -size / 2, size, size).fill({ color: colorHex, alpha: 0.9 })
      else gg.circle(0, 0, size / 2).fill({ color: colorHex, alpha: 0.9 })

      gg.position.set(x, y)

      const a = Math.random() * Math.PI * 2
      const sp = 70 + Math.random() * 120
      const vx = Math.cos(a) * sp
      const vy = Math.sin(a) * sp - 40

      const id = nextParticleId++
      particleLayer.addChild(gg)
      particles.push({ id, life: 0.55 + Math.random() * 0.25, vx, vy, g: gg })
    }
  }

  function startGame() {
    void ensureAudio()
    sfxStart()

    status.value = 'playing'
    elapsed = 0
    spawnAcc = 0
    hitsSinceChange = 0
    timeLeft.value = cfg.roundSeconds
    lives.value = cfg.lives
    score.value = 0
    combo.value = 0

    // pick first target from early palette
    const pal = paletteByProgress(0)
    target.value = pick(pal)
    targetFlash.value = 0.35
  }

  function endGame() {
    status.value = 'gameover'
    sfxGameOver()
  }

  function maybeChangeTarget() {
    const pal = paletteByProgress(progress01())

    if (score.value > 0 && score.value % cfg.changeEveryPoints === 0) {
      target.value = nextTarget(pal, target.value)
      targetFlash.value = 0.45
      hitsSinceChange = 0
      sfxChange()
      return
    }

    if (hitsSinceChange >= cfg.changeEveryHits) {
      target.value = nextTarget(pal, target.value)
      targetFlash.value = 0.45
      hitsSinceChange = 0
      sfxChange()
    }
  }

  function onPop(b: Balloon) {
    const hit = b.colorKey === target.value

    spawnPopParticles(b.g.x, b.g.y, COLORS[b.colorKey].hex)

    // remove balloon
    balloonLayer.removeChild(b.g)
    b.g.destroy({ children: true })
    balloons = balloons.filter((x) => x.id !== b.id)

    if (hit) {
      sfxPop()
      hitsSinceChange += 1
      combo.value += 1
      score.value += 1 + comboBonus(combo.value)
      maybeChangeTarget()
      return
    }

    // miss
    sfxWrong()
    missFlash = 1
    hitsSinceChange = 0
    combo.value = 0
    lives.value -= 1
    if (lives.value <= 0) endGame()
  }

  function drawBackground() {
    const w = app.renderer.width
    const h = app.renderer.height

    // sky gradient-ish using two rects (fast)
    bg.clear()
    bg.rect(0, 0, w, h).fill({ color: 0x0b1730, alpha: 1 })
    bg.rect(0, 0, w, h * 0.55).fill({ color: 0x123a6b, alpha: 0.55 })

    // clouds
    bg.ellipse(w * 0.2, h * 0.22, 54, 22).fill({ color: 0xffffff, alpha: 0.08 })
    bg.ellipse(w * 0.27, h * 0.22, 40, 18).fill({ color: 0xffffff, alpha: 0.07 })

    bg.ellipse(w * 0.78, h * 0.16, 60, 24).fill({ color: 0xffffff, alpha: 0.07 })
    bg.ellipse(w * 0.72, h * 0.16, 38, 18).fill({ color: 0xffffff, alpha: 0.06 })

    // subtle ground
    bg.rect(0, h - 42, w, 42).fill({ color: 0x000000, alpha: 0.18 })
  }

  function renderOverlay() {
    const w = app.renderer.width
    const h = app.renderer.height

    overlay.clear()
    overlay.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0 })

    if (missFlash > 0) {
      overlay.rect(0, 0, w, h).fill({ color: 0xff3c3c, alpha: 0.15 * missFlash })
    }

    // ready/gameover center banner (simple)
    if (status.value === 'ready' || status.value === 'gameover') {
      overlay.roundRect(w * 0.12, h * 0.4, w * 0.76, 120, 16).fill({ color: 0x000000, alpha: 0.45 })

      const title = status.value === 'ready' ? 'Tap to Start' : 'Game Over'
      const sub = status.value === 'ready' ? '只點目標顏色！' : 'Tap / Click to Restart'

      // light-weight fake text (dots) would be silly; use DOM HUD instead.
      // Here we just keep a clickable banner.
      // (We keep the text in Vue above the canvas.)
      overlay.roundRect(w * 0.12, h * 0.4, w * 0.76, 120, 16).stroke({ width: 2, color: 0xffffff, alpha: 0.12 })

      // expose title/sub via aria? handled by DOM.
      void title
      void sub
    }
  }

  // click empty area to start/restart
  overlay.on('pointertap', async () => {
    await ensureAudio()

    if (status.value === 'ready') startGame()
    else if (status.value === 'gameover') {
      resetGame()
      startGame()
    }
  })

  // resize handling
  const onResize = () => {
    // fixed height in CSS; renderer height follows element, so enforce.
    el.style.height = `${cfg.cssHeight}px`
    drawBackground()
  }
  window.addEventListener('resize', onResize)

  drawBackground()
  resetGame()

  // main loop
  app.ticker.add((ticker: any) => {
    const dt = Math.min(0.05, ticker.deltaMS / 1000)

    drawBackground()

    // decay flashes
    missFlash = Math.max(0, missFlash - dt * 3)
    targetFlash.value = Math.max(0, targetFlash.value - dt)

    if (status.value === 'playing') {
      elapsed += dt
      timeLeft.value = Math.max(0, cfg.roundSeconds - elapsed)

      // spawn balloons
      spawnAcc += dt * 1000
      const spawnMs = currentSpawnMs()
      while (spawnAcc >= spawnMs) {
        spawnAcc -= spawnMs
        spawnBalloon()
      }

      // update balloons
      const w = app.renderer.width
      for (const b of balloons) {
        b.vy = -(currentRiseSpeed() * (0.92 + Math.random() * 0.02))
        b.g.x += b.vx * dt
        b.g.y += b.vy * dt

        // bounce on side edges (soft)
        if (b.g.x < b.r) {
          b.g.x = b.r
          b.vx = Math.abs(b.vx)
        } else if (b.g.x > w - b.r) {
          b.g.x = w - b.r
          b.vx = -Math.abs(b.vx)
        }

        // remove off top
        if (b.g.y + b.r < -60) {
          balloonLayer.removeChild(b.g)
          b.g.destroy({ children: true })
        }
      }
      balloons = balloons.filter((b) => b.g && !b.g.destroyed)

      // particles
      for (const p of particles) {
        p.life -= dt
        p.g.x += p.vx * dt
        p.g.y += p.vy * dt
        p.vy += 220 * dt
        p.g.alpha = clamp(p.life / 0.6, 0, 1)
        p.g.rotation += dt * 6
        if (p.life <= 0) {
          particleLayer.removeChild(p.g)
          p.g.destroy({ children: true })
        }
      }
      particles = particles.filter((p) => p.g && !p.g.destroyed)

      if (timeLeft.value <= 0) {
        endGame()
      }
    }

    renderOverlay()
  })

  destroyFn = () => {
    window.removeEventListener('resize', onResize)
    app.destroy(true)
    el.replaceChildren()
  }
})

onBeforeUnmount(() => {
  destroyFn?.()
  destroyFn = null

  try {
    audioCtx?.close()
  } catch {
    // ignore
  }
  audioCtx = null
})

function toggleMute() {
  muted.value = !muted.value
  if (!muted.value) void ensureAudio()
}
</script>

<template>
  <div class="cbp-root d-flex flex-column align-center">
    <div class="d-flex align-center justify-space-between w-100 mb-3" style="max-width: 920px">
      <div class="d-flex align-center ga-2 flex-wrap">
        <v-chip size="small" variant="tonal" color="primary">Score: {{ score }}</v-chip>
        <v-chip size="small" variant="tonal" color="primary">Combo: {{ combo }}</v-chip>
        <v-chip size="small" variant="tonal" color="primary">Lives: {{ lives }}</v-chip>
        <v-chip size="small" variant="tonal" color="primary">Time: {{ Math.ceil(timeLeft) }}s</v-chip>
        <v-chip
          size="small"
          variant="flat"
          :style="{
            background: `#${COLORS[target].hex.toString(16).padStart(6, '0')}`,
            color: '#111',
            transform: targetFlash > 0 ? 'scale(1.06)' : 'scale(1)'
          }"
        >
          目標：{{ targetLabel }}
        </v-chip>
      </div>

      <div class="d-flex align-center ga-2">
        <v-btn size="small" variant="tonal" @click="toggleMute">{{ muted ? 'Unmute' : 'Mute' }}</v-btn>
      </div>
    </div>

    <div ref="mountRef" class="pixi-mount" />

    <div class="text-caption text-medium-emphasis mt-3" style="max-width: 920px">
      操作：只點「目標顏色」的氣球得分；點錯會扣心。目標顏色會不定期換色，記得看提示！
    </div>
  </div>
</template>

<style scoped>
.cbp-root {
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.pixi-mount {
  width: 100%;
  max-width: 920px;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}

.pixi-mount :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
}
</style>
