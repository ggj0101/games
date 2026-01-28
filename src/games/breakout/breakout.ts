import type { BreakoutConfig, GameStatus } from './types'

export type Brick = {
  x: number
  y: number
  alive: boolean
}

export type BreakoutState = {
  status: GameStatus
  score: number
  lives: number

  paddleX: number
  paddleDir: -1 | 0 | 1

  ballX: number
  ballY: number
  ballVX: number
  ballVY: number

  bricks: Brick[]
}

export function defaultConfig(): BreakoutConfig {
  return {
    width: 640,
    height: 480,

    paddleWidth: 100,
    paddleHeight: 14,
    paddleSpeed: 520,

    ballRadius: 8,
    ballSpeed: 320,

    brickRows: 6,
    brickCols: 5,
    brickWidth: 110,
    brickHeight: 22,
    brickPadding: 10,
    brickOffsetTop: 60,
    brickOffsetLeft: 35,

    lives: 3
  }
}

export function createInitialState(cfg: BreakoutConfig): BreakoutState {
  const paddleX = (cfg.width - cfg.paddleWidth) / 2

  const bricks: Brick[] = []
  for (let r = 0; r < cfg.brickRows; r++) {
    for (let c = 0; c < cfg.brickCols; c++) {
      const x = cfg.brickOffsetLeft + c * (cfg.brickWidth + cfg.brickPadding)
      const y = cfg.brickOffsetTop + r * (cfg.brickHeight + cfg.brickPadding)
      bricks.push({ x, y, alive: true })
    }
  }

  // Ball starts above the paddle
  const ballX = cfg.width / 2
  const ballY = cfg.height - cfg.paddleHeight - cfg.ballRadius - 24

  return {
    status: 'ready',
    score: 0,
    lives: cfg.lives,

    paddleX,
    paddleDir: 0,

    ballX,
    ballY,
    ballVX: 0,
    ballVY: 0,

    bricks
  }
}

export function startGame(cfg: BreakoutConfig, s: BreakoutState) {
  if (s.status === 'playing') return
  if (s.status === 'gameover' || s.status === 'cleared') return

  s.status = 'playing'

  if (s.ballVX === 0 && s.ballVY === 0) {
    // launch with a slight angle
    const speed = cfg.ballSpeed
    s.ballVX = speed * 0.55
    s.ballVY = -speed * 0.85
  }
}

export function togglePause(s: BreakoutState) {
  if (s.status === 'playing') s.status = 'paused'
  else if (s.status === 'paused') s.status = 'playing'
}

export function resetGame(cfg: BreakoutConfig): BreakoutState {
  return createInitialState(cfg)
}

export function setPaddleDir(s: BreakoutState, dir: -1 | 0 | 1) {
  s.paddleDir = dir
}

export function setPaddleByMouse(cfg: BreakoutConfig, s: BreakoutState, canvasX: number) {
  // canvasX is relative to canvas left
  const target = canvasX - cfg.paddleWidth / 2
  s.paddleX = clamp(target, 0, cfg.width - cfg.paddleWidth)
}

export function step(cfg: BreakoutConfig, s: BreakoutState, dt: number) {
  if (s.status !== 'playing') return

  // Move paddle
  if (s.paddleDir !== 0) {
    s.paddleX = clamp(
      s.paddleX + s.paddleDir * cfg.paddleSpeed * dt,
      0,
      cfg.width - cfg.paddleWidth
    )
  }

  // Move ball
  s.ballX += s.ballVX * dt
  s.ballY += s.ballVY * dt

  // Wall collisions (left/right)
  if (s.ballX - cfg.ballRadius <= 0) {
    s.ballX = cfg.ballRadius
    s.ballVX *= -1
  } else if (s.ballX + cfg.ballRadius >= cfg.width) {
    s.ballX = cfg.width - cfg.ballRadius
    s.ballVX *= -1
  }

  // Ceiling
  if (s.ballY - cfg.ballRadius <= 0) {
    s.ballY = cfg.ballRadius
    s.ballVY *= -1
  }

  // Paddle collision
  const paddleTop = cfg.height - cfg.paddleHeight - 16
  const paddleLeft = s.paddleX
  const paddleRight = s.paddleX + cfg.paddleWidth

  const withinPaddleX = s.ballX >= paddleLeft && s.ballX <= paddleRight
  const hitsPaddleY = s.ballY + cfg.ballRadius >= paddleTop && s.ballY + cfg.ballRadius <= paddleTop + cfg.paddleHeight

  if (withinPaddleX && hitsPaddleY && s.ballVY > 0) {
    // reflect with angle based on hit position
    const hit = (s.ballX - paddleLeft) / cfg.paddleWidth // 0..1
    const angle = lerp(-0.9, 0.9, hit) // radians-ish factor
    const speed = cfg.ballSpeed

    s.ballVX = speed * angle
    s.ballVY = -Math.sqrt(Math.max(1, speed * speed - s.ballVX * s.ballVX))

    // ensure we don't stick
    s.ballY = paddleTop - cfg.ballRadius - 0.5
  }

  // Brick collisions (simple AABB)
  for (const b of s.bricks) {
    if (!b.alive) continue

    const bx1 = b.x
    const by1 = b.y
    const bx2 = b.x + cfg.brickWidth
    const by2 = b.y + cfg.brickHeight

    const closestX = clamp(s.ballX, bx1, bx2)
    const closestY = clamp(s.ballY, by1, by2)
    const dx = s.ballX - closestX
    const dy = s.ballY - closestY
    const dist2 = dx * dx + dy * dy

    if (dist2 <= cfg.ballRadius * cfg.ballRadius) {
      b.alive = false
      s.score += 10

      // Basic response: flip the axis with bigger penetration
      if (Math.abs(dx) > Math.abs(dy)) s.ballVX *= -1
      else s.ballVY *= -1

      break
    }
  }

  // Check clear
  if (s.bricks.every((b) => !b.alive)) {
    s.status = 'cleared'
    s.ballVX = 0
    s.ballVY = 0
    return
  }

  // Bottom (lose life)
  if (s.ballY - cfg.ballRadius > cfg.height) {
    s.lives -= 1

    if (s.lives <= 0) {
      s.status = 'gameover'
      s.ballVX = 0
      s.ballVY = 0
      return
    }

    // Reset ball on paddle
    s.ballX = cfg.width / 2
    s.ballY = cfg.height - cfg.paddleHeight - cfg.ballRadius - 24
    s.ballVX = 0
    s.ballVY = 0
    s.status = 'ready'
  }
}

export function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}
