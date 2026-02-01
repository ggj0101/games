# 2026-02-01 — GAMES 首頁重構（Professional Game Portal）

## 目標
把 `/` 首頁重構成「看起來像專業游戲網站」的入口頁：有品牌感、清楚的資訊層級、可探索（搜尋/篩選）。

## 範圍
- 只改首頁（`src/views/HomeView.vue`）與其需要的資料/小元件。
- 不改各遊戲本體邏輯（canvas/engine）。

## 玩法/操作（首頁）
- 使用者可：
  - 透過 **搜尋**（title/description）找到遊戲
  - 透過 **Tag 篩選**（多選）縮小範圍
  - 點卡片或 Play 進入遊戲

## UI/UX
### 視覺層級
1. Hero：品牌（GAMES）+ tagline + 主要 CTA
2. Featured：推薦一個可玩的遊戲
3. Browse：搜尋/Tag + 遊戲網格

### 卡片內容
- icon / cover 區塊
- title + description
- tags
- status chip（READY / SOON）
- primary action（Play / Coming soon）

### 響應式
- Mobile-first（xs 一欄）
- sm/md：2–3 欄
- lg+：3–4 欄

### 無障礙
- 卡片可 focus，Enter/Space 可進入
- 狀態不只靠顏色（文字 + chip）

## 技術方案
- 新增 `src/data/games.ts` 作為單一資料來源（方便未來擴充與重用）。
- `HomeView` 以 computed 產生：
  - all tags
  - filtered list
  - featured game（第一個 ready）

## 風險與縮減
- 風險：視覺調整過頭變得很重。
  - 縮減：只用 Vuetify + CSS gradient，不引入新動畫/圖庫。

## 驗證清單
- [ ] 首頁可正常顯示 hero/featured/browse
- [ ] 搜尋與 tag 篩選可用
- [ ] READY 卡片可進入對應路由
- [ ] `npm run lint` 無 error
- [ ] `npm run build` 成功

---

## 自我檢查修訂（至少 3 次）

### Revision 1
- 初稿：定義首頁資訊架構（Hero/Featured/Browse）與探索能力（搜尋 + tags）。

### Revision 2
- 加入 a11y 要求（focus + Enter/Space）與狀態不只靠顏色。

### Revision 3
- 明確資料來源：`src/data/games.ts` 做 single source of truth，避免 HomeView 內 hardcode。

## Changelog
- v1 → v2：補 a11y
- v2 → v3：補資料模型與 single source of truth
