<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

export type RadarBlip = {
  id: string
  name: string
  // normalized (-1..1) in radar space
  nx: number
  ny: number
  isClamped: boolean
  isFound: boolean
  color: string
}

const props = defineProps<{
  blips: RadarBlip[]
  // meters shown at outer ring radius
  rangeMeters: number
  // id of the nearest (unfound) target (can be clamped)
  nearestId?: string | null
  // radar sweep speed turns / sec
  sweepSpeed?: number
  // audio must be armed by a user gesture
  audioArmed?: boolean
}>()

const mountRef = ref<HTMLDivElement | null>(null)

let destroyFn: (() => void) | null = null

onMounted(async () => {
  const el = mountRef.value
  if (!el) return

  // Dynamic import so Pixi code is only loaded when this page is visited.
  const PIXI = await import('pixi.js')

  const app = new PIXI.Application()
  await app.init({
    resizeTo: el,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(2, window.devicePixelRatio || 1)
  })

  el.appendChild(app.canvas)

  // --- Scene graph ---
  const root = new PIXI.Container()
  app.stage.addChild(root)

  const maskG = new PIXI.Graphics()
  const grid = new PIXI.Graphics()
  const sweep = new PIXI.Sprite()
  const sweepLine = new PIXI.Graphics()
  const blipLayer = new PIXI.Container()
  const textLayer = new PIXI.Container()

  root.addChild(grid)
  root.addChild(sweep)
  root.addChild(sweepLine)
  root.addChild(blipLayer)
  root.addChild(textLayer)

  // Apply circular mask
  root.mask = maskG
  app.stage.addChild(maskG)

  // Glow-ish blending
  sweep.blendMode = 'add'
  sweep.alpha = 0.9

  // Build sweep texture (canvas gradient -> texture)
  function makeSweepTexture(radiusPx: number) {
    const c = document.createElement('canvas')
    const size = Math.ceil(radiusPx * 2)
    c.width = size
    c.height = size
    const ctx = c.getContext('2d')
    if (!ctx) return PIXI.Texture.WHITE

    ctx.clearRect(0, 0, size, size)
    ctx.translate(size / 2, size / 2)

    // wedge angle
    const a0 = -0.22
    const a1 = 0.22

    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radiusPx)
    grad.addColorStop(0, 'rgba(120,255,190,0.22)')
    grad.addColorStop(0.55, 'rgba(120,255,190,0.12)')
    grad.addColorStop(1, 'rgba(120,255,190,0)')

    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, radiusPx, a0, a1)
    ctx.closePath()
    ctx.fill()

    return PIXI.Texture.from(c)
  }

  // Helpers
  function niceScale(rangeMeters: number) {
    const nice: number[] = [10, 20, 50, 100, 200, 500, 1000, 2000]
    const target = rangeMeters * 0.33
    let v: number = nice[0]!
    for (const n of nice) if (n <= target) v = n
    return v
  }

  function layout() {
    const w = app.renderer.width
    const h = app.renderer.height
    const cx = w / 2
    const cy = h / 2
    const r = Math.min(w, h) * 0.46

    root.position.set(cx, cy)

    // mask
    maskG.clear()
    maskG.circle(cx, cy, r).fill({ color: 0xffffff, alpha: 1 })

    // grid
    grid.clear()

    // radar glass background (make it look like an actual radar, even over maps)
    grid.circle(0, 0, r).fill({ color: 0x06110d, alpha: 0.55 })

    // rings
    grid.setStrokeStyle({ width: 2, color: 0x42f59e, alpha: 0.22 })
    for (const k of [0.25, 0.5, 0.75, 1]) {
      grid.circle(0, 0, r * k).stroke()
    }

    // cross
    grid.moveTo(-r, 0).lineTo(r, 0).stroke()
    grid.moveTo(0, -r).lineTo(0, r).stroke()

    // extra faint ring ticks (feel more "radar")
    grid.setStrokeStyle({ width: 1, color: 0x42f59e, alpha: 0.14 })
    for (let a = 0; a < 360; a += 15) {
      const ang = (a * Math.PI) / 180
      const x0 = Math.cos(ang) * (r * 0.92)
      const y0 = Math.sin(ang) * (r * 0.92)
      const x1 = Math.cos(ang) * r
      const y1 = Math.sin(ang) * r
      grid.moveTo(x0, y0).lineTo(x1, y1).stroke()
    }

    // cardinal labels (north-up)
    textLayer.removeChildren()
    const style = new PIXI.TextStyle({
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      fontSize: 12,
      fill: 'rgba(170,255,220,0.75)'
    })

    const labels: Array<[string, number]> = [
      ['N', 0],
      ['E', Math.PI / 2],
      ['S', Math.PI],
      ['W', (Math.PI * 3) / 2]
    ]
    for (const [lab, ang] of labels) {
      const t = new PIXI.Text({ text: lab, style })
      t.anchor.set(0.5)
      const x = Math.cos(ang - Math.PI / 2) * (r - 12)
      const y = Math.sin(ang - Math.PI / 2) * (r - 12)
      t.position.set(x, y)
      textLayer.addChild(t)
    }

    // scale bar
    const barMeters = niceScale(props.rangeMeters)
    const barPx = (barMeters / props.rangeMeters) * r
    const scaleG = new PIXI.Graphics()
    scaleG.roundRect(-r + 8, r - 40, barPx + 28, 24, 6).fill({ color: 0x04110b, alpha: 0.55 })
    scaleG.setStrokeStyle({ width: 3, color: 0x42f59e, alpha: 0.35 })
    scaleG.moveTo(-r + 18, r - 18).lineTo(-r + 18 + barPx, r - 18).stroke()
    scaleG.setStrokeStyle({ width: 2, color: 0x42f59e, alpha: 0.35 })
    scaleG.moveTo(-r + 18, r - 24).lineTo(-r + 18, r - 12).stroke()
    scaleG.moveTo(-r + 18 + barPx, r - 24).lineTo(-r + 18 + barPx, r - 12).stroke()
    textLayer.addChild(scaleG)

    const sText = new PIXI.Text({ text: `${barMeters} m`, style })
    sText.anchor.set(0, 0)
    sText.position.set(-r + 18, r - 38)
    textLayer.addChild(sText)

    // sweep texture
    sweep.texture = makeSweepTexture(r)
    sweep.anchor.set(0.5)
    sweep.position.set(0, 0)
    sweep.width = r * 2
    sweep.height = r * 2

    // border
    grid.setStrokeStyle({ width: 3, color: 0x42f59e, alpha: 0.28 })
    grid.circle(0, 0, r).stroke()

    return { r }
  }

  let rCache = layout().r

  // --- Blips: keep stable display objects so we can animate pulses.
  const blipMap = new Map<
    string,
    {
      root: any
      dot: any
      ring: any
      arrow: any
      baseRadius: number
      pulseT: number // 0..1
    }
  >()

  function getOrCreateBlip(id: string) {
    const existing = blipMap.get(id)
    if (existing) return existing

    const root = new PIXI.Container()
    const dot = new PIXI.Graphics()
    const ring = new PIXI.Graphics()
    const arrow = new PIXI.Graphics()
    root.addChild(ring)
    root.addChild(arrow)
    root.addChild(dot)

    const rec = { root, dot, ring, arrow, baseRadius: 5, pulseT: 0 }
    blipMap.set(id, rec)
    blipLayer.addChild(root)
    return rec
  }

  function removeMissingBlips(ids: Set<string>) {
    for (const [id, rec] of blipMap) {
      if (!ids.has(id)) {
        rec.root.destroy({ children: true })
        blipMap.delete(id)
      }
    }
  }

  function renderBlips() {
    const r = rCache

    const ids = new Set<string>()

    for (const b of props.blips) {
      ids.add(b.id)

      const rec = getOrCreateBlip(b.id)

      // Project to radar circle edge when out of range.
      const nx = b.nx
      const ny = b.ny
      const len = Math.sqrt(nx * nx + ny * ny)
      const k = len > 1 ? 1 / len : 1
      const px = nx * k
      const py = ny * k

      const x = px * r
      const y = py * r

      rec.root.position.set(x, y)

      // visuals
      const baseAlpha = b.isFound ? 0.25 : 0.95
      const c = b.isFound ? 0x3cffaa : Number.parseInt(b.color.replace('#', ''), 16)

      rec.baseRadius = b.isFound ? 4 : 5

      rec.dot.clear()
      rec.dot.circle(0, 0, rec.baseRadius).fill({ color: c, alpha: baseAlpha })

      rec.ring.clear()
      if (!b.isFound) {
        rec.ring.setStrokeStyle({ width: 2, color: c, alpha: 0.45 })
        rec.ring.circle(0, 0, 11).stroke()
      }

      rec.arrow.clear()
      if (b.isClamped) {
        // Arrow should point outward, and sit on the clamped edge.
        const ang = Math.atan2(py, px)
        const s = 12
        const tipX = Math.cos(ang) * 0
        const tipY = Math.sin(ang) * 0
        rec.arrow
          .poly([
            tipX,
            tipY,
            tipX - Math.cos(ang - 0.55) * s,
            tipY - Math.sin(ang - 0.55) * s,
            tipX - Math.cos(ang + 0.55) * s,
            tipY - Math.sin(ang + 0.55) * s
          ])
          .fill({ color: c, alpha: 0.75 })
      }

      rec.root.alpha = 1
    }

    removeMissingBlips(ids)
  }

  watch(
    () => [props.blips, props.rangeMeters],
    () => {
      rCache = layout().r
      renderBlips()
    },
    { deep: true }
  )

  watch(
    () => props.audioArmed,
    () => {
      if (props.audioArmed) void ensureAudio()
    }
  )

  // Resize listener
  const onResize = () => {
    rCache = layout().r
    renderBlips()
  }
  window.addEventListener('resize', onResize)

  // --- Beep (WebAudio) ---
  let audioCtx: AudioContext | null = null

  async function ensureAudio() {
    if (!props.audioArmed) return
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      if (audioCtx.state === 'suspended') await audioCtx.resume()
    } catch {
      // ignore
    }
  }

  function beep() {
    if (!props.audioArmed || !audioCtx || audioCtx.state !== 'running') return

    try {
      const t0 = audioCtx.currentTime
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, t0)

      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09)

      osc.connect(gain)
      gain.connect(audioCtx.destination)

      osc.start(t0)
      osc.stop(t0 + 0.1)
    } catch {
      // ignore
    }
  }

  // Animation
  let t0 = performance.now()
  let lastBeepAt = 0
  app.ticker.add(() => {
    const t = (performance.now() - t0) / 1000

    // rotate sweep
    const speed = props.sweepSpeed ?? 0.45
    const sweepRot = (t * speed * Math.PI * 2) % (Math.PI * 2)
    sweep.rotation = sweepRot

    // sweep line
    sweepLine.clear()
    sweepLine.setStrokeStyle({ width: 2, color: 0x7cffbe, alpha: 0.32 })
    sweepLine.moveTo(0, 0)
    sweepLine.lineTo(rCache, 0)
    sweepLine.stroke()
    sweepLine.rotation = sweepRot

    // Find nearest in-range (not clamped, not found)
    let nearest: RadarBlip | null = null
    let best = Number.POSITIVE_INFINITY
    for (const b of props.blips) {
      if (b.isFound || b.isClamped) continue
      const d2 = b.nx * b.nx + b.ny * b.ny
      if (d2 < best) {
        best = d2
        nearest = b
      }
    }

    // Trigger pulse + beep when sweep passes over nearest target.
    if (nearest) {
      // Angle of target in radar coords. sweepRot is 0 along +x.
      const targetAng = Math.atan2(nearest.ny, nearest.nx)
      let diff = ((targetAng - sweepRot + Math.PI) % (Math.PI * 2)) - Math.PI
      diff = Math.abs(diff)

      const inWindow = diff < 0.14
      const now = performance.now() / 1000

      if (inWindow && now - lastBeepAt > 0.7) {
        lastBeepAt = now
        const rec = blipMap.get(nearest.id)
        if (rec) rec.pulseT = 1
        beep()
      }
    }

    // Animate pulses + nearest breathing
    const breathe = 0.7 + 0.3 * Math.sin(t * 4.5)
    for (const [id, rec] of blipMap) {
      if (rec.pulseT > 0) {
        // ease-out pulse: 1 -> 0
        rec.pulseT = Math.max(0, rec.pulseT - 0.06)
        const k = rec.pulseT
        const s = 1 + 0.7 * Math.sin((1 - k) * Math.PI) * k
        rec.dot.scale.set(s)
        rec.ring.scale.set(1 + 0.6 * (1 - k))
        rec.ring.alpha = 0.35 + 0.35 * k
      } else if (props.nearestId && id === props.nearestId) {
        // Always highlight nearest target (even if clamped).
        rec.dot.scale.set(1 + 0.18 * breathe)
        rec.ring.scale.set(1 + 0.25 * breathe)
        rec.ring.alpha = 0.35 + 0.35 * breathe
        rec.root.alpha = 0.85 + 0.15 * breathe
      } else {
        rec.dot.scale.set(1)
        rec.ring.scale.set(1)
        rec.root.alpha = 1
      }
    }

    // subtle blink for clamped arrows (slightly stronger)
    const blink = 0.6 + 0.35 * Math.sin(t * 6)
    for (const rec of blipMap.values()) {
      if (rec.arrow.geometry && rec.arrow.geometry.graphicsData?.length) {
        rec.arrow.alpha = blink
      }
    }
  })

  // Initial
  renderBlips()
  void ensureAudio()

  destroyFn = () => {
    window.removeEventListener('resize', onResize)
    app.destroy(true)
    el.replaceChildren()
  }
})

onBeforeUnmount(() => {
  destroyFn?.()
  destroyFn = null
})
</script>

<template>
  <div ref="mountRef" class="pixi-mount" />
</template>

<style scoped>
.pixi-mount {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  pointer-events: none;
}
</style>
