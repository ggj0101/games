# 星星接接樂（Star Catcher）— 規格書（2026-01-30）

## A. 發想 / 核心概念
給 3–12 歲小朋友玩的短回合手機小遊戲（固定時間比總分）：
- 天上會掉下「星星」
- 玩家用 **Touch 點擊/長按** 直接把星星「點掉」
- **小星**：碰一下就消失（tap）
- **大星**：需要「分段長按」把它磨到變小直到消失（hold，可分段累積）
- 回合時間固定（建議 60 秒），比總分，適合親子/同學輪流 PK

**設計目標**：
- 10 秒內懂玩法
- 不需要文字閱讀也能玩
- 幼齡友善：大星可以分段處理、進度不清零

---

## B. 技術選型
**選用：原生 Canvas 2D（搭配 Vue 3 元件生命週期）**

理由：
1. 本遊戲只需要簡單幾何圖形（圓形星星 + HUD），不需要重型框架。
2. 互動是單一平面 2D，命中判定就是圓形 hit test，實作快速。
3. 能以最小依賴快速完成「能玩」的 MVP；效能、資源釋放都更直覺。
4. 專案已是 Vue + Vite；Canvas 作為可卸載 component 最乾淨。

> 備註：本專案也已含 PixiJS，但此遊戲不需要圖層/濾鏡/資源管理，故不使用。

---

## C. 規格（玩法 / 操作 / 得分回饋 / 難度曲線）

### 1) 玩法（回合制 + 比總分）
- 星星會從畫面上方隨機 x 位置掉落。
- 玩家用 **點擊（tap）/長按（hold）** 消除星星得分。
- 遊戲採「回合制」：
  - **固定一回合 60 秒**（MVP 先固定，不做切換）
  - 時間到結算分數（Score）
- 生命值（Lives）預設 3（增加刺激但不挫折）：
  - **只有「大星」落地（未消除）才扣 1 生命**
  - 生命歸零立即 Game Over（提前結束該回合）

### 2) 星星種類與消除規則

#### 小星（Small）
- 操作：**tap 一下立刻消除**
- 得分：+1
- 漏掉：不扣命（可選：不扣分；MVP 先不扣分）

#### 大星（Big / Hold Star）
- 操作：需要長按「磨損」星星；**允許分段長按**（放開不清零、不回復進度）。
- 大星有 `hp`（0→1）：
  - 初始 `hp = 1.0`
  - 玩家按住且命中時，hp 會線性下降
  - **約 0.9 秒（累積）可以把 hp 磨到 0 → 消除**
- **視覺進度**：星星會隨 hp 下降而縮小（看得懂、很直覺）。
  - 半徑：`r = rMin + (rMax - rMin) * hp`
  - 建議：`rMax = 26px`，`rMin = 10px`
- 漏掉：大星落地（y 超過地面線）→ 扣 1 Lives

### 3) 操作（手機優先）
- **Touch / 滑鼠**：
  - `pointerdown`：判定是否點到星星
    - 點到小星：立即消除
    - 點到大星：進入「磨損」狀態
  - `pointermove`：若手指滑出命中範圍，停止磨損；滑回來可繼續
  - `pointerup/cancel`：停止磨損（但進度保留）
- 命中容錯：大星命中半徑建議 `hitRadius = r + 10px`（手機遮住也好點）
- Canvas CSS：`touch-action: none;` 避免頁面捲動干擾

### 4) 得分 / Combo（加分但保持簡單）
- 基礎得分：
  - 小星：+1
  - 大星：+3（值得花時間磨）

- Combo：
  - 成功消除任意星星 → `combo += 1` 並重設 `comboTimer`
  - `comboTimer` 倒數歸零 → `combo = 0`
  - 建議：`comboWindow = 1.2s`
  - 分數加成：每次得分加上 `bonus = min(floor(combo/5), 5)`
    - 例：combo 1–4：+0；5–9：+1；…；>=25：+5

- HUD 顯示：Score / Lives / Time / Combo

### 5) 道具（分成增益 / 減益；先做 2 個）
道具也以「掉落物」形式出現，玩家 tap 觸發。

#### 增益型（Buff）— 磁鐵
- 名稱：Magnet Buff
- 觸發：tap 到磁鐵道具
- 效果：持續 3 秒，點擊命中容錯增加（`hitRadius += 12px`）
- 視覺：畫面邊框/星星微發光，右上角顯示 Buff 倒數

#### 減益型（Debuff）— 黏黏（你選的 A）
- 名稱：Sticky Debuff
- 觸發：tap 到黏黏道具
- 效果：持續 3 秒，**大星磨損速度變慢**（例如 `burnRate *= 0.6`）
- 視覺：畫面略偏暗或加一層淡淡的黏液濾鏡感（MVP 可用簡單半透明 overlay）

> 出現比例建議：道具每 6–10 秒隨機一次；Buff:Debuff ≈ 70:30（整體體驗偏正向）。

### 6) 難度曲線（清楚、可調、可控）
以「時間經過」增加難度（不增加長按時間，避免越玩越累）：
- 0–15s：慢速、小星為主（讓小朋友熟悉）
- 15–40s：速度提升、大星比例提高
- 40–60s：速度快、大星比例高

可調參數（初版只動 2 個就夠）：
- 生成間隔（spawn interval）：起始 900ms → 350ms
- 落下速度（fall speed）：起始 120 px/s → 320 px/s
- 大星比例（big ratio）：起始 20% → 45%（隨時間線性提高）

---

## D. 資產清單（Assets）
**MVP 全部用程式繪製**（避免卡在美術）：
- 小星：黃色圓形 + 白色高光點
- 大星：較大圓形 + 進度表現（縮小 + 外圈描邊可選）
- Buff/DeBuff 道具：不同顏色的圓形 icon（例如磁鐵藍色、黏黏紫色）
- 背景：深色漸層 + 少量靜態星點

---

## E. 音效設計（觸發時機）
**使用 Web Audio API 以合成音（beep）產生音效**（免外部檔案）。

音效事件（MVP 必做）：
1. **tapClear**：小星消除
   - 觸發：tap 命中小星
   - 聲音：短促清脆高音（例 880Hz，40ms）
2. **holdTick（可選）**：磨損中提示
   - 觸發：按住命中大星期間，每 200ms 輕微提示（音量極低，避免吵）
3. **holdClear**：大星消除完成
   - 觸發：大星 hp ≤ 0
   - 聲音：更亮的「叮」（例 660→990Hz）
4. **missBig**：大星落地（扣命）
   - 觸發：大星 y > 地面線
   - 聲音：短促低音（例 220Hz，70ms）
5. **buffOn**：吃到磁鐵 Buff
   - 觸發：Buff 開始
6. **debuffOn**：吃到黏黏 Debuff
   - 觸發：Debuff 開始
7. **start**：開始/重玩
8. **gameover**：Lives 歸零

音量與靜音：
- 右上角提供 Mute 切換（預設開啟）
- iOS/Safari：AudioContext 需使用者互動解鎖 → 在首次 `pointerdown` 初始化

---

## F. 技術方案（實作概要）

### 1) 路由 / 結構
- 路由：`/star-catcher`
- 首頁入口：星星接接樂 → `/star-catcher`

### 2) Canvas 尺寸與座標
- Canvas 以容器寬度為主，固定高度（例如 480）
- 使用 devicePixelRatio 做高清：
  - `canvas.width = cssWidth * dpr`
  - `canvas.height = cssHeight * dpr`
  - `ctx.scale(dpr, dpr)`

### 3) 遊戲迴圈
- `requestAnimationFrame` 主迴圈
- dt 使用 `performance.now()` 差值（秒）
- `onBeforeUnmount()`：
  - cancelAnimationFrame
  - removeEventListener
  - 停止音效（必要時 close AudioContext）

### 4) 物件模型
- Star：
  - `{ id, kind: 'small'|'big'|'buff'|'debuff', x, y, r, vy, hp?, alive }`
- ActiveHold：
  - `{ pointerId, starId }`（同一時間只允許按住一顆大星也可；MVP 建議允許單指就好）

### 5) 命中判定（Tap/Hold）
- 圓形 hit test：`distance(pointer, starCenter) <= hitRadius`
- 大星磨損：
  - 若 pointer 按住且命中該大星：`hp -= burnRate * dt`
  - burnRate 使得累積約 0.9 秒磨完：`burnRate ~= 1/0.9`
- **分段長按**：pointerup 只停止磨損，不改 hp

---

## G. 風險與縮減（Scope Control）
風險：
1. 手指遮住星星導致「我明明按了卻不算」的挫折
2. iOS/Safari 的 AudioContext 需要互動解鎖
3. 道具與 combo 讓規則變複雜

縮減策略：
- 命中容錯加大（hitRadius +10~12px），並強化視覺回饋（縮小=進度）
- 音效先做 4 個核心（tapClear/holdClear/missBig/start）
- 道具先只做 2 個（Magnet Buff、Sticky Debuff）且固定時長 3 秒

---

## H. 驗證清單（Definition of Done）
1. ✅ 進入 `/star-catcher` 可看到遊戲畫面
2. ✅ 點擊 Start 後開始掉星星，Time 60 秒倒數
3. ✅ tap 小星會消除並加分
4. ✅ 長按大星會隨時間縮小；放開後進度保留；累積約 0.9 秒可磨到消失
5. ✅ 大星落地會扣 Lives；Lives 歸零顯示 Game Over
6. ✅ Combo 可累積並影響得分（有顯示）
7. ✅ Magnet Buff 生效 3 秒（命中容錯變大）
8. ✅ Sticky Debuff 生效 3 秒（大星磨損變慢）
9. ✅ 難度會隨時間提升（速度/生成間隔/大星比例至少一項有效）
10. ✅ 離開頁面不會繼續佔用 CPU（動畫與監聽已清理）

---

## I. 自我檢查與修訂紀錄（Changelog）

### Revision 1
- 初稿：定義玩法、生命制、難度曲線與音效事件。

### Revision 2
- 加入 combo 與加成，但保持公式簡單（每 5 combo +1），避免 UI 太複雜。
- 明確規定先以程式繪製資產，避免被美術拖延。

### Revision 3
- 增加 Scope Control：若難度/密度過高，先只調速度、固定生成間隔。
- 明確列出 iOS AudioContext 互動限制與對策（首次 pointerdown 初始化）。

### Revision 4 (Touch 玩法改版)
- 操作從「底盤滑動接星星」改為「手機 Touch 點擊/分段長按消除」。
- 大星：分段長按累積磨損，**約 0.9 秒磨完**；放開 **不回復、不清零**；以「縮小」呈現進度。
- 回合制：**固定 60 秒比總分**；Lives 只對「大星漏掉」生效。
- 道具改成二分類：Buff（Magnet）/ Debuff（Sticky）。
