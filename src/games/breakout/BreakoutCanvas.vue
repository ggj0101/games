<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import {
  createInitialState,
  defaultConfig,
  resetGame,
  setPaddleByMouse,
  setPaddleDir,
  startGame,
  step,
  togglePause
} from './breakout'
import { render } from './render'
import type { BreakoutConfig, GameStatus } from './types'

const cfg = ref<BreakoutConfig>(defaultConfig())
const status = ref<GameStatus>('ready')
const score = ref(0)
const lives = ref(cfg.value.lives)

const wrapperRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

const isFullscreen = ref(false)
const canFullscreen = computed(() => typeof document !== 'undefined' && !!document.documentElement.requestFullscreen)

let raf = 0
let lastTs = 0
let state = createInitialState(cfg.value)

function syncRefs() {
  status.value = state.status
  score.value = state.score
  lives.value = state.lives
}

function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return

  // Fixed internal resolution; scaled by CSS.
  canvas.width = cfg.value.width
  canvas.height = cfg.value.height

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  render(ctx, cfg.value, state)
}

function loop(ts: number) {
  raf = requestAnimationFrame(loop)

  if (!lastTs) lastTs = ts
  const dt = Math.min(0.033, (ts - lastTs) / 1000)
  lastTs = ts

  step(cfg.value, state, dt)
  syncRefs()

  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  render(ctx, cfg.value, state)
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

function onStart() {
  startGame(cfg.value, state)
  syncRefs()
  ensureLoopRunning()
}

function onPauseToggle() {
  togglePause(state)
  syncRefs()
  ensureLoopRunning()
}

function onRestart() {
  state = resetGame(cfg.value)
  syncRefs()
  ensureLoopRunning()
  resizeCanvas()
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'ArrowLeft') {
    setPaddleDir(state, -1)
  } else if (e.key === 'ArrowRight') {
    setPaddleDir(state, 1)
  } else if (e.key === ' ') {
    e.preventDefault()
    if (state.status === 'ready') onStart()
    else onPauseToggle()
  } else if (e.key.toLowerCase() === 'r') {
    onRestart()
  }
}

function onKeyUp(e: KeyboardEvent) {
  if (e.key === 'ArrowLeft' && state.paddleDir === -1) setPaddleDir(state, 0)
  if (e.key === 'ArrowRight' && state.paddleDir === 1) setPaddleDir(state, 0)
}

function setPaddleFromClientX(clientX: number) {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const x = clientX - rect.left
  setPaddleByMouse(cfg.value, state, (x / rect.width) * cfg.value.width)
}

function onPointerMove(e: PointerEvent) {
  // Works for mouse + touch + pen
  setPaddleFromClientX(e.clientX)
}

function onTouchMove(e: TouchEvent) {
  // iOS sometimes prefers touch events for scrolling contexts
  const t = e.touches.item(0)
  if (!t) return
  setPaddleFromClientX(t.clientX)
}

function onPressLeft(down: boolean) {
  setPaddleDir(state, down ? -1 : 0)
}

function onPressRight(down: boolean) {
  setPaddleDir(state, down ? 1 : 0)
}

async function toggleFullscreen() {
  const el = wrapperRef.value
  if (!el) return

  try {
    if (!document.fullscreenElement) {
      await el.requestFullscreen()
    } else {
      await document.exitFullscreen()
    }
  } catch {
    // Some mobile browsers block fullscreen; ignore silently.
  }
}

function onFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
  // redraw after layout change
  resizeCanvas()
}

onMounted(() => {
  resizeCanvas()
  syncRefs()
  ensureLoopRunning()

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  document.addEventListener('fullscreenchange', onFullscreenChange)

  const onResize = () => resizeCanvas()
  window.addEventListener('resize', onResize)

  onBeforeUnmount(() => {
    window.removeEventListener('resize', onResize)
  })
})

onBeforeUnmount(() => {
  stopLoop()
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
})
</script>

<template>
  <div ref="wrapperRef" class="d-flex flex-column align-center breakout-wrapper" :class="{ fullscreen: isFullscreen }">
    <canvas
      ref="canvasRef"
      class="breakout-canvas"
      tabindex="0"
      @pointermove="onPointerMove"
      @touchmove.prevent="onTouchMove"
    />

    <div class="mt-4 d-flex ga-2 flex-wrap justify-center">
      <v-chip color="primary" variant="tonal">Score: {{ score }}</v-chip>
      <v-chip color="primary" variant="tonal">Lives: {{ lives }}</v-chip>
      <v-chip color="secondary" variant="tonal">Status: {{ status }}</v-chip>
    </div>

    <div class="mt-4 d-flex ga-2 flex-wrap justify-center">
      <v-btn color="primary" @click="onStart" :disabled="status === 'playing'">Start</v-btn>
      <v-btn
        color="secondary"
        @click="onPauseToggle"
        :disabled="status === 'ready' || status === 'gameover' || status === 'cleared'"
      >
        {{ status === 'paused' ? 'Resume' : 'Pause' }}
      </v-btn>
      <v-btn variant="tonal" @click="onRestart">Restart</v-btn>

      <v-btn
        v-if="canFullscreen"
        variant="outlined"
        @click="toggleFullscreen"
      >
        {{ isFullscreen ? 'Exit Fullscreen' : 'Fullscreen' }}
      </v-btn>
    </div>

    <!-- Mobile-friendly on-screen controls -->
    <div class="mt-4 d-flex ga-3 justify-center d-sm-none">
      <v-btn
        icon="mdi-chevron-left"
        size="x-large"
        color="primary"
        variant="tonal"
        @pointerdown.prevent="onPressLeft(true)"
        @pointerup.prevent="onPressLeft(false)"
        @pointercancel.prevent="onPressLeft(false)"
        @pointerleave.prevent="onPressLeft(false)"
      />
      <v-btn
        icon="mdi-chevron-right"
        size="x-large"
        color="primary"
        variant="tonal"
        @pointerdown.prevent="onPressRight(true)"
        @pointerup.prevent="onPressRight(false)"
        @pointercancel.prevent="onPressRight(false)"
        @pointerleave.prevent="onPressRight(false)"
      />
    </div>

    <p class="text-caption text-medium-emphasis mt-4 text-center" style="max-width: 720px;">
      Mobile: drag on canvas or use ◀ ▶ buttons · Desktop: mouse move / ← → · Space Start/Pause · R Restart
    </p>
  </div>
</template>

<style scoped>
.breakout-wrapper {
  width: 100%;
}

.breakout-canvas {
  width: min(100%, 640px);
  aspect-ratio: 640 / 480;
  border-radius: 14px;
  outline: none;
  background: rgba(255, 255, 255, 0.04);
  touch-action: none; /* prevent scroll/zoom while dragging */
}

.breakout-wrapper.fullscreen {
  width: 100vw;
  height: 100vh;
  padding: 12px;
  justify-content: center;
}

.breakout-wrapper.fullscreen .breakout-canvas {
  width: min(100vw, calc(100vh * (640 / 480)));
  height: auto;
  border-radius: 0;
}
</style>
