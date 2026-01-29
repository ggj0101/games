# games 專案：小遊戲 Library 選用原則（Phaser / PixiJS / 原生 Canvas）

本文件定義 `games` 專案中，每個小遊戲如何選擇最適合的 rendering / game library，並提供一致的工程規範（Vue + Vite + TS）。

## 核心原則
1. **每個遊戲可以用不同 library**（Phaser / PixiJS / 原生 Canvas 都可混用）。
2. 以「**需求**」決定 library，而不是以「統一」決定。
3. 必須滿足一致的生命週期與資源釋放：
   - `onMounted()` 初始化
   - `onBeforeUnmount()` destroy / clear / remove listeners
   - 任何 `requestAnimationFrame`、`watchPosition`、事件監聽都要可停止
4. 優先採用 **動態 import**（按路由分 chunk），避免首頁載入變慢。

---

## 什麼情況選哪個？

### A) Phaser（遊戲框架）
**適合：**
- 你在做「完整遊戲」：關卡、碰撞、角色控制、敵人、音效、UI、資源載入流程
- 想要標準 Scene lifecycle（preload/create/update）
- 想要快速做出「可玩」內容

**不適合：**
- 你只是要很客製的視覺 HUD / 可視化（會覺得框架太重、太有主見）

**建議用法：**
- `const Phaser = await import('phaser')`
- `new Phaser.Game({ parent: el, ... })`
- `onBeforeUnmount()`：`game.destroy(true)`

### B) PixiJS（渲染引擎 / 2D renderer）
**適合：**
- 你在做「很客製的 2D 視覺」：雷達 HUD、特效、遮罩、濾鏡、圖層合成
- 需要穩定高效的 WebGL/Canvas 渲染，但遊戲規則自己掌控
- 你不需要 Phaser 那套 Scene/物理/資源流程

**不適合：**
- 你希望引擎直接幫你把「碰撞、關卡、事件流程」都串好

**建議用法：**
- `const PIXI = await import('pixi.js')`
- `const app = new PIXI.Application({ ... })`
- `onBeforeUnmount()`：`app.destroy(true, { children: true, texture: true, baseTexture: true })`

### C) 原生 Canvas（2D context）
**適合：**
- 遊戲很小、規則簡單、只有少量物件
- 想要 bundle 最小、依賴最少
- 你可以快速自己寫 update/render loop

**風險/代價：**
- 你要自己維護：resize、輸入、資源、效能、特效

---

## 工程規範（必做）

### 1) 每個遊戲是一個 Vue component
路徑建議：
- `src/games/<game-key>/<GameRoot>.vue`
- 邏輯檔：`src/games/<game-key>/*.ts`

### 2) 動態載入（推薦）
避免首頁就把 Phaser/Pixi 全載入。

```ts
const Phaser = await import('phaser')
// or
const PIXI = await import('pixi.js')
```

### 3) Destroy/cleanup 清單
- `requestAnimationFrame`：`cancelAnimationFrame`
- `setInterval`/`setTimeout`：`clearInterval`/`clearTimeout`
- DOM listeners：`removeEventListener`
- Geolocation：`navigator.geolocation.clearWatch(watchId)`
- Phaser：`game.destroy(true)`
- Pixi：`app.destroy(true, {...})`

### 4) 手機/權限注意
- Geolocation 需要 HTTPS 或 localhost
- DeviceOrientation（iOS）通常需要使用者手勢 + permission

---

## 現有遊戲的 library 建議（目前 repo 狀態）

### 1) Breakout（打磚塊）
**現況：**
- 現在是原生 Canvas + 自製 state/step/render，已經可以 dev/build，且 mobile/fullscreen 都做了。

**建議：維持原生 Canvas（目前最合理）**
- 理由：
  - 規則簡單，現有程式已穩定
  - 改成 Phaser 成本高（重寫碰撞/輸入/渲染），收益有限
- 什麼時候再考慮 Phaser：
  - 你要加入更多玩法（道具、關卡編輯器、粒子特效、音效系統、多角色/敵人）

### 2) 龍珠雷達（Dragonball Radar）
**現況：**
- 現在是 Vue + 原生 Canvas HUD + Google Maps embed iframe + 真實 GPS/指南針/行進方向/透明度控制。

**建議：維持原生 Canvas（短期），中期可升級 PixiJS**
- 短期理由：
  - 目前主要複雜度在「感測器 / 座標 / UX」，不是渲染效能
  - 原生 Canvas 夠用且已做出產品行為
- 中期升級到 PixiJS 的理由：
  - 更容易做漂亮的雷達特效（掃描光錐、殘影、遮罩、blend、shader）
  - 多圖層合成更舒服

---

## 下一步（可選）
1. 建立 `Phaser Demo` / `Pixi Demo` 兩個入口，驗證混用與 destroy 流程。
2. 把「遊戲列表」抽成 config 檔（例如 `src/games/registry.ts`），HomeView 不用手動改。
