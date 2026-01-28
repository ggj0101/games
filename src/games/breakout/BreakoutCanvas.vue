<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { defaultConfig, createInitialState, resetGame, setPaddleByMouse, setPaddleDir, startGame, step, togglePause } from './breakout'
import { render } from './render'
import type { BreakoutConfig, GameStatus } from './types'

const cfg = ref<BreakoutConfig>(defaultConfig())
const status = ref<GameStatus>('ready')
const score = ref(0)
const lives = ref(cfg.value.lives)

const canvasRef = ref<HTMLCanvasElement | null>(null)

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

  // Fixed game resolution; scale via CSS for crispness.
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
  if (state.status === 'paused') {
    // keep RAF running to render overlay, but stop physics by state machine
    ensureLoopRunning()
  } else if (state.status === 'playing') {
    ensureLoopRunning()
  }
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

function onMouseMove(e: MouseEvent) {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left

  setPaddleByMouse(cfg.value, state, (x / rect.width) * cfg.value.width)
}

onMounted(() => {
  resizeCanvas()
  syncRefs()
  ensureLoopRunning()

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
})

onBeforeUnmount(() => {
  stopLoop()
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
})

onMounted(() => {
  // If the user changes window size, canvas should keep same internal resolution.
  // We only re-render to be safe.
  const onResize = () => resizeCanvas()
  window.addEventListener('resize', onResize)
  onBeforeUnmount(() => window.removeEventListener('resize', onResize))
})
</script>

<template>
  <div class="d-flex flex-column align-center">
    <canvas
      ref="canvasRef"
      class="breakout-canvas"
      tabindex="0"
      @mousemove="onMouseMove"
    />

    <div class="mt-4 d-flex ga-2 flex-wrap justify-center">
      <v-chip color="primary" variant="tonal">Score: {{ score }}</v-chip>
      <v-chip color="primary" variant="tonal">Lives: {{ lives }}</v-chip>
      <v-chip color="secondary" variant="tonal">Status: {{ status }}</v-chip>
    </div>

    <div class="mt-4 d-flex ga-2 flex-wrap justify-center">
      <v-btn color="primary" @click="onStart" :disabled="status === 'playing'">
        Start
      </v-btn>
      <v-btn color="secondary" @click="onPauseToggle" :disabled="status === 'ready' || status === 'gameover' || status === 'cleared'">
        {{ status === 'paused' ? 'Resume' : 'Pause' }}
      </v-btn>
      <v-btn variant="tonal" @click="onRestart">Restart</v-btn>
    </div>

    <p class="text-caption text-medium-emphasis mt-4 text-center" style="max-width: 640px;">
      Controls: Mouse move / ← → to move paddle · Space to Start/Pause · R to Restart
    </p>
  </div>
</template>

<style scoped>
.breakout-canvas {
  width: min(100%, 640px);
  aspect-ratio: 640 / 480;
  border-radius: 14px;
  outline: none;
  background: rgba(255, 255, 255, 0.04);
}
</style>
