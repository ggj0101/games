# GAMES 專案規格書

> 本文件描述 `games` 專案的 UI（Vuetify）與小遊戲功能規格，並作為後續實作依據。

## 目標

1. 使用 **Vue 3 + TypeScript + Vite** 建置前端專案。
2. 導入 **Vuetify 3** 作為 UI 元件庫。
3. 提供一個「**選擇遊戲的首頁**」。
4. 實作一個可遊玩的 **2D 打磚塊（Breakout）** 小遊戲。
5. 專案需可執行（`npm run dev`）且可建置（`npm run build`）。

## 技術堆疊

- Vue 3（Composition API / `<script setup>`）
- TypeScript
- Vite
- Vuetify 3
- Vue Router 4
- ESLint（flat config）

## 路由

- `/`：首頁（Game Select）
- `/breakout`：打磚塊遊戲
- 其他路由：顯示簡單 Not Found 頁面（可選）

## UI/UX 規格

### 全站 Layout

- 使用 Vuetify `v-app` 作為根。
- 頂部 `v-app-bar`：顯示專案名稱 **GAMES**，並提供返回首頁的入口。
- 主內容 `v-main` + `v-container`。

### 首頁（`/`）

目的：讓使用者選擇要玩的遊戲。

- 顯示標題：`Game Select`
- 使用 `v-card` + `v-btn` 方式呈現遊戲列表
- 目前至少提供 1 個遊戲：
  - **Breakout（打磚塊）** → 進入 `/breakout`
- 預留未來擴充欄位（例如：遊戲狀態、難度、簡介）。

### 打磚塊頁（`/breakout`）

- 以 `v-card` 包住遊戲區與狀態資訊
- 遊戲主畫面使用 HTML `<canvas>`（2D context）
- 顯示 HUD 資訊：
  - 分數（Score）
  - 生命（Lives）
  - 狀態：Ready / Playing / Paused / Game Over / Cleared
- 提供按鈕：
  - Start / Restart
  - Pause / Resume

## 遊戲規格：2D 打磚塊（Breakout）

### 操作

- 滑鼠移動：控制擋板（paddle）左右
- 鍵盤：
  - `←` / `→`：左右移動
  - `Space`：開始 / 暫停切換（視狀態）
  - `R`：重新開始

### 規則

- 球碰到牆壁反彈；碰到底邊則失去一條生命。
- 球碰到擋板反彈，反彈角度會依「撞到擋板的位置」做些微變化（增加可玩性）。
- 球碰到磚塊：磚塊消失、分數增加、球反彈。
- 生命歸零：Game Over。
- 清除所有磚塊：Cleared（通關）。

### 基本參數（可調）

- Canvas：寬 640、高 480（隨容器自適應可選）
- 磚塊：5 欄 × 6 列（可調），每塊固定 1 hit
- 初始 lives：3
- 球速：初始適中（可用常數設定）

### 遊戲狀態機

- `ready`：顯示「Start」
- `playing`：requestAnimationFrame 更新
- `paused`：停止更新（保留畫面）
- `gameover`：顯示 Restart
- `cleared`：顯示 Restart

## 驗收 / 測試（可執行）

- `npm run dev` 能啟動並進入首頁
- 首頁可導到 `/breakout`
- `/breakout` 可開始遊戲並可互動
- `npm run lint` 無 error（允許 warnings）
- `npm run build` 成功

## 專案結構（建議）

- `spec/`：規格書（本檔）
- `src/router/`：路由
- `src/views/`：頁面
- `src/components/`：共用元件
- `src/games/breakout/`：遊戲邏輯與元件
