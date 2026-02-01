export type GameStatus = 'ready' | 'coming-soon'

export type GameMeta = {
  key: string
  title: string
  description: string
  to: string
  status: GameStatus
  tags: string[]
  icon: string
  minutes?: number
  age?: string
}

export const GAMES: GameMeta[] = [
  {
    key: 'breakout',
    title: 'Breakout（打磚塊）',
    description: '2D 打磚塊：用擋板反彈球，清光所有磚塊。',
    to: '/breakout',
    status: 'ready',
    tags: ['arcade', 'classic', 'keyboard', 'mouse'],
    icon: 'mdi-gamepad-variant',
    minutes: 3,
    age: '6+'
  },
  {
    key: 'dragonball-radar',
    title: '龍珠雷達',
    description: '真實定位雷達：接近目標會拉近，抵達後顯示成功找到。',
    to: '/dragonball-radar',
    status: 'ready',
    tags: ['location', 'outdoor', 'mobile'],
    icon: 'mdi-radar',
    minutes: 5,
    age: '8+'
  },
  {
    key: 'star-catcher',
    title: '星星接接樂（Star Catcher）',
    description: '點小星星得分；長按大星分段磨到變小消失，60 秒比總分。',
    to: '/star-catcher',
    status: 'ready',
    tags: ['touch', 'arcade', 'kids', 'mobile'],
    icon: 'mdi-star-four-points',
    minutes: 1,
    age: '3+'
  },
  {
    key: 'jelly-match',
    title: '果凍配對（Jelly Match）',
    description: '點指定顏色的果凍得分；點錯扣生命。45 秒挑戰連擊！',
    to: '/jelly-match',
    status: 'ready',
    tags: ['reaction', 'kids', 'mobile', 'touch'],
    icon: 'mdi-candy',
    minutes: 1,
    age: '4+'
  },
  {
    key: 'color-balloon-pop',
    title: '彩色氣球爆爆樂（Color Balloon Pop）',
    description: '只點目標顏色的氣球！點錯扣心，60 秒挑戰高分與連擊。',
    to: '/color-balloon-pop',
    status: 'ready',
    tags: ['touch', 'arcade', 'kids', 'mobile'],
    icon: 'mdi-balloon',
    minutes: 1,
    age: '3+'
  },
  {
    key: 'tomato-timer',
    title: '番茄鐘（規劃中）',
    description: '規劃中的番茄鐘小遊戲：專注/休息節奏 + 音效 + 小成就。',
    to: '/tomato-timer',
    status: 'coming-soon',
    tags: ['productivity', 'coming-soon'],
    icon: 'mdi-timer-sand',
    minutes: 25,
    age: 'all'
  }
]
