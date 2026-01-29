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
  // radar sweep speed turns / sec
  sweepSpeed?: number
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

    // subtle dark overlay (helps readability over map)
    grid.circle(0, 0, r).fill({ color: 0x000000, alpha: 0.06 })

    // rings
    grid.setStrokeStyle({ width: 2, color: 0x000000, alpha: 0.18 })
    for (const k of [0.25, 0.5, 0.75, 1]) {
      grid.circle(0, 0, r * k).stroke()
    }

    // cross
    grid.moveTo(-r, 0).lineTo(r, 0).stroke()
    grid.moveTo(0, -r).lineTo(0, r).stroke()

    // cardinal labels (north-up)
    textLayer.removeChildren()
    const style = new PIXI.TextStyle({
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      fontSize: 12,
      fill: 'rgba(0,0,0,0.65)'
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
    scaleG.roundRect(-r + 8, r - 40, barPx + 28, 24, 6).fill({ color: 0xffffff, alpha: 0.55 })
    scaleG.setStrokeStyle({ width: 3, color: 0x000000, alpha: 0.6 })
    scaleG.moveTo(-r + 18, r - 18).lineTo(-r + 18 + barPx, r - 18).stroke()
    scaleG.setStrokeStyle({ width: 2, color: 0x000000, alpha: 0.6 })
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
    grid.setStrokeStyle({ width: 3, color: 0x000000, alpha: 0.35 })
    grid.circle(0, 0, r).stroke()

    return { r }
  }

  let rCache = layout().r

  // Update blips
  function renderBlips() {
    blipLayer.removeChildren()

    const r = rCache

    for (const b of props.blips) {
      const x = Math.max(-1, Math.min(1, b.nx)) * r
      const y = Math.max(-1, Math.min(1, b.ny)) * r

      const g = new PIXI.Graphics()
      const baseAlpha = b.isFound ? 0.35 : 0.9

      const c = b.isFound ? 0x3cffaa : Number.parseInt(b.color.replace('#', ''), 16)

      g.circle(x, y, b.isFound ? 4 : 5).fill({ color: c, alpha: baseAlpha })

      // pulse ring (unfound)
      if (!b.isFound) {
        g.setStrokeStyle({ width: 2, color: c, alpha: 0.45 })
        g.circle(x, y, 11).stroke()
      }

      // edge arrow for clamped
      if (b.isClamped) {
        const ang = Math.atan2(y, x)
        const ax = Math.cos(ang) * (r - 6)
        const ay = Math.sin(ang) * (r - 6)
        const s = 10
        const a = new PIXI.Graphics()
        a.poly([
          ax,
          ay,
          ax - Math.cos(ang - 0.55) * s,
          ay - Math.sin(ang - 0.55) * s,
          ax - Math.cos(ang + 0.55) * s,
          ay - Math.sin(ang + 0.55) * s
        ]).fill({ color: c, alpha: 0.6 })
        blipLayer.addChild(a)
      }

      blipLayer.addChild(g)
    }
  }

  watch(
    () => [props.blips, props.rangeMeters],
    () => {
      rCache = layout().r
      renderBlips()
    },
    { deep: true }
  )

  // Resize listener
  const onResize = () => {
    rCache = layout().r
    renderBlips()
  }
  window.addEventListener('resize', onResize)

  // Animation
  let t0 = performance.now()
  app.ticker.add(() => {
    const t = (performance.now() - t0) / 1000

    // rotate sweep
    const speed = props.sweepSpeed ?? 0.45
    sweep.rotation = (t * speed * Math.PI * 2) % (Math.PI * 2)

    // sweep line
    sweepLine.clear()
    sweepLine.setStrokeStyle({ width: 2, color: 0x000000, alpha: 0.28 })
    sweepLine.moveTo(0, 0)
    sweepLine.lineTo(rCache, 0)
    sweepLine.stroke()
    sweepLine.rotation = sweep.rotation

    // subtle pulse for clamped arrows
    for (const child of blipLayer.children) {
      if (child instanceof PIXI.Graphics) continue
      child.alpha = 0.45 + 0.25 * Math.sin(t * 6)
    }
  })

  // Initial
  renderBlips()

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
