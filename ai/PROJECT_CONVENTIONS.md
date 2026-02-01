# GAMES — Project Conventions (工程共識)

這份文件把 `spec/LIBRARY_STRATEGY.md` 的工程規範變成「實作時必遵守」的 checklist。

---

## 1) 遊戲元件形態

- 每個遊戲是一個 Vue component（Game Root）。
- 路徑建議：
  - `src/games/<game-key>/<GameRoot>.vue`
  - `src/games/<game-key>/*.ts`（邏輯/物件/數學）

## 2) 動態載入大型 library（推薦）

- Pixi / Phaser / Leaflet：用動態 import

```ts
const PIXI = await import('pixi.js')
```

## 3) Cleanup / Destroy（必做）

在 `onBeforeUnmount()` 內至少做到：

- `requestAnimationFrame` → `cancelAnimationFrame`
- `setInterval`/`setTimeout` → `clearInterval`/`clearTimeout`
- DOM listeners → `removeEventListener`
- Geolocation → `navigator.geolocation.clearWatch(watchId)`
- PixiJS → `app.destroy(true, { children: true, texture: true, baseTexture: true })`
- Phaser → `game.destroy(true)`

## 4) Canvas / DPR resize（手機必做）

- 依 `devicePixelRatio` 設定 canvas backing store
- resize 時重新設定 `canvas.width/height` + 轉換座標

## 5) 事件（手機優先）

- 優先使用 Pointer Events：`pointerdown/move/up/cancel`
- Canvas element 加：`touch-action: none;`（避免捲動/縮放手勢干擾）

---

## 6) Definition of Done（每個變更）

- [ ] `npm run lint` 無 error
- [ ] `npm run build` 成功
- [ ] 相關路由可進入/離開（多次切換不會 memory leak 或持續跑 ticker）
