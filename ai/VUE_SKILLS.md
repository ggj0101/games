# GAMES — Vue Skills Rules (實作規範)

這份規範用來「模擬/套用」vuejs-ai/skills 的效果：
- 在你用 Codex / Gemini / Copilot 寫 Vue 3 時，保持一致的最佳實踐。

使用方式（建議）：
- 每次請 AI 寫 Vue 相關內容前，prompt 前綴：`Use vue skill, ...`

---

## 1) Vue 3 + TS + Composition API（預設）

- 預設使用 `<script setup lang="ts">`
- 避免在同一檔案同時混用 Options API
- 狀態與邏輯優先抽到 composables（`src/composables/` 或 `src/games/<game>/composables/`）

## 2) 可重用 composable 介面（MaybeRef / MaybeRefOrGetter）

當 composable 的輸入可能是「值 / ref / getter」時：
- 參考 VueUse 風格用 `MaybeRef` 或 `MaybeRefOrGetter`
- 對 DOM target 請支援 `HTMLElement | null | undefined`

（如果本 repo 未引入 VueUse types，就在本專案內定義最小 type alias。）

## 3) Router / View 結構

- 每個路由頁面放在 `src/views/`
- 每個小遊戲主邏輯放在 `src/games/<game-key>/`
- View 只做「容器 + layout + 進出場」，遊戲 loop/engine 不要塞在 View 內

## 4) 事件與生命週期

- 所有 `addEventListener` 必須對應 `removeEventListener`
- 任何 `requestAnimationFrame`、`setInterval`、ticker 都必須在 `onBeforeUnmount` 停止

## 5) 反應式最佳實踐

- `ref` 用於 primitive
- 物件/陣列：視情況使用 `reactive` 或 `ref([])`，避免不必要的深層追蹤
- 對於大量物件（粒子/彈幕等），優先把「遊戲狀態」放在非 reactive 結構，僅把 HUD 需要的資料同步到 Vue state

## 6) 效能與可讀性

- 避免在 render loop 內建立大量新物件（尤其是每 frame new array/object）
- 命名清楚、切小函式、把 magic numbers 抽成常數

## 7) 錯誤處理

- 對於需要權限的 API（Geolocation、DeviceOrientation 等），必須提供 UI 提示與 fallback

