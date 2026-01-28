export type GameStatus = 'ready' | 'playing' | 'paused' | 'gameover' | 'cleared'

export type Vec2 = { x: number; y: number }

export type BreakoutConfig = {
  width: number
  height: number

  paddleWidth: number
  paddleHeight: number
  paddleSpeed: number

  ballRadius: number
  ballSpeed: number

  brickRows: number
  brickCols: number
  brickWidth: number
  brickHeight: number
  brickPadding: number
  brickOffsetTop: number
  brickOffsetLeft: number

  lives: number
}
