import type { BreakoutConfig } from './types'
import type { BreakoutState } from './breakout'

export function render(ctx: CanvasRenderingContext2D, cfg: BreakoutConfig, s: BreakoutState) {
  // background
  ctx.clearRect(0, 0, cfg.width, cfg.height)

  // subtle grid
  ctx.save()
  ctx.globalAlpha = 0.08
  ctx.strokeStyle = '#ffffff'
  for (let x = 0; x <= cfg.width; x += 40) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, cfg.height)
    ctx.stroke()
  }
  for (let y = 0; y <= cfg.height; y += 40) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(cfg.width, y)
    ctx.stroke()
  }
  ctx.restore()

  // bricks
  for (const b of s.bricks) {
    if (!b.alive) continue
    ctx.fillStyle = '#7c4dff'
    roundRect(ctx, b.x, b.y, cfg.brickWidth, cfg.brickHeight, 6)
    ctx.fill()
  }

  // paddle
  const paddleTop = cfg.height - cfg.paddleHeight - 16
  ctx.fillStyle = '#00e5ff'
  roundRect(ctx, s.paddleX, paddleTop, cfg.paddleWidth, cfg.paddleHeight, 8)
  ctx.fill()

  // ball
  ctx.beginPath()
  ctx.fillStyle = '#ffffff'
  ctx.arc(s.ballX, s.ballY, cfg.ballRadius, 0, Math.PI * 2)
  ctx.fill()

  // overlay text
  if (s.status === 'ready') {
    overlay(ctx, cfg, 'Ready', 'Press Space / Start')
  } else if (s.status === 'paused') {
    overlay(ctx, cfg, 'Paused', 'Press Space / Resume')
  } else if (s.status === 'gameover') {
    overlay(ctx, cfg, 'Game Over', 'Press R / Restart')
  } else if (s.status === 'cleared') {
    overlay(ctx, cfg, 'Cleared!', 'Press R / Restart')
  }
}

function overlay(ctx: CanvasRenderingContext2D, cfg: BreakoutConfig, title: string, subtitle: string) {
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(0, 0, cfg.width, cfg.height)

  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  ctx.font = 'bold 36px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
  ctx.fillText(title, cfg.width / 2, cfg.height / 2 - 18)

  ctx.font = '16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
  ctx.globalAlpha = 0.9
  ctx.fillText(subtitle, cfg.width / 2, cfg.height / 2 + 18)
  ctx.restore()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}
