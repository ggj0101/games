# 星星接接樂（Star Catcher）— 規格書（2026-01-30）

## A. 發想 / 核心概念
給 3–12 歲小朋友玩的 30 秒～2 分鐘短回合小遊戲：
- 天上會掉下「星星」
- 玩家控制底部的「籃子」去接
- 接到得分、有音效回饋；沒接到會扣生命/扣分
- 隨時間越來越快（難度曲線清楚）

**設計目標**：
- 10 秒內懂玩法
- 立刻可玩（不需要文字閱讀）
- 失敗也不挫折（生命制 + 明確回饋）

---

## B. 技術選型
**選用：原生 Canvas 2D（搭配 Vue 3 元件生命週期）**

理由：
1. 本遊戲只需要簡單幾何圖形（圓形星星 + 矩形籃子 + HUD），不需要重型框架。
2. 互動是單一平面 2D，碰撞可用 AABB / 圓-矩形近似即可。
3. 能以最小依賴快速完成「能玩」的 MVP；效能、資源釋放都更直覺。
4. 專案已是 Vue + Vite；Canvas 作為一個可卸載的 component 最乾淨。

> 備註：本專案也已含 PixiJS，但此遊戲不需要圖層/濾鏡/資源管理，故不使用。

---

## C. 規格（玩法 / 操作 / 得分回饋 / 難度曲線）

### 1) 玩法
- 星星會從畫面上方隨機 x 位置掉落。
- 玩家控制底部籃子左右移動，讓星星落入籃子。
- 遊戲採「回合制」：
  - 預設一回合 60 秒（可在 UI 切換 30/60/90 秒，先做 60 秒即可）
  - 時間到結算分數
- 生命值（Lives）預設 3：
  - 星星落地（未接到）扣 1 生命
  - 生命歸零立即 Game Over

### 2) 操作
- **滑鼠 / 觸控**：
  - 在畫布上移動指標（pointermove）→ 籃子中心跟隨 x
- **鍵盤（可選但建議）**：
  - ← / →：左右移動
  - Space：開始 / 重新開始

### 3) 得分與回饋
- 接到星星：+1 分
- 連續接到（Combo）：
  - 若 1.5 秒內連續接到下一顆，combo +1
  - 分數加成：每顆星星得分 = 1 + floor(combo/5)
  - 失誤（漏接）combo 歸零
- HUD 顯示：Score / Lives / Time / Combo
- 視覺回饋：
  - 接到：星星縮放消失 + 籃子閃一下
  - 漏接：畫面底部閃紅一下

### 4) 難度曲線（清楚、可調、可控）
以「時間經過」增加難度：
- 0–15s：慢速、低密度（讓小朋友熟悉）
- 15–35s：中速、密度提升
- 35–60s：快速、密度高

具體參數（可調）：
- 生成間隔（spawn interval）：
  - 起始 900ms，線性下降至 350ms
- 落下速度（fall speed）：
  - 起始 120 px/s，線性上升至 320 px/s
- 籃子寬度：
  - 起始 120px，最後可縮至 90px（可選，若太難就不縮）

---

## D. 資產清單（Assets）
**MVP 全部用程式繪製**（避免卡在美術）：
- 星星：黃色圓形 + 白色高光點（或五角星簡化為圓形）
- 籃子：藍色圓角矩形
- 背景：深色漸層 + 少量靜態星點

可選（加料）：
- 以 SVG/PNG 替換星星與籃子

---

## E. 音效設計（觸發時機）
**使用 Web Audio API 以合成音（beep）產生音效**（免外部檔案）。

音效事件：
1. **catch**：接到星星
   - 觸發：星星與籃子碰撞成立那一刻
   - 聲音：短促高音（例如 880Hz，40ms）
2. **miss**：漏接（星星落地）
   - 觸發：星星 y > 地面線且未被接到
   - 聲音：短促低音（例如 220Hz，60ms）
3. **gameover**：生命歸零
   - 觸發：Lives 變成 0
   - 聲音：下降音階（例如 440→220Hz）
4. **start**：按下開始
   - 觸發：Start / Restart
   - 聲音：提示音（例如 660Hz，50ms）

音量與靜音：
- 右上角提供一個簡單的 Mute 切換（預設開啟；若 iOS 首次互動前不能播放，等首次 pointerdown 再初始化 AudioContext）。

---

## F. 技術方案（實作概要）

### 1) 路由 / 結構
- 新增路由：`/star-catcher`
- 首頁清單新增：星星接接樂 → `/star-catcher`

檔案規劃：
- `src/views/StarCatcherView.vue`
- `src/games/star-catcher/StarCatcherCanvas.vue`
- （可選）`src/games/star-catcher/audio.ts`：音效工具
- （可選）`src/games/star-catcher/types.ts`

### 2) Canvas 尺寸與座標
- Canvas 以容器寬度為主，固定高度（例如 480）。
- 使用 devicePixelRatio 做高清：
  - 實際 canvas.width = cssWidth * dpr
  - 繪圖時 ctx.scale(dpr, dpr)

### 3) 遊戲迴圈
- `requestAnimationFrame` 主迴圈
- dt 使用 `performance.now()` 差值（秒）
- `onBeforeUnmount()`：
  - cancelAnimationFrame
  - removeEventListener
  - 停止音效（AudioContext 可保留或 close）

### 4) 物件模型
- Star：{ id, x, y, r, vy, caught }
- Basket：{ x, y, w, h }
- 碰撞：
  - 近似用「圓心落在籃子矩形內」或「圓-矩形距離」

### 5) 難度控制
- 以 `t = elapsedSeconds / roundSeconds` 正規化
- spawnInterval = lerp(900, 350, easeIn(t))
- fallSpeed = lerp(120, 320, easeIn(t))

---

## G. 風險與縮減（Scope Control）
風險：
1. 觸控/滑鼠座標換算與 dpr 導致偏移
2. iOS / Safari 的 AudioContext 需要使用者互動才能播放
3. 難度調太快導致 3–6 歲挫折

縮減策略：
- 先用「圓形星星 + 矩形籃子」完成可玩；不做 PNG/SVG。
- 音效先用單音 beep；不做背景音樂。
- 難度先只調落下速度；生成間隔固定（必要時）。

---

## H. 驗證清單（Definition of Done）
1. ✅ 進入 `/star-catcher` 可看到遊戲畫面
2. ✅ 點擊 Start 後開始掉星星
3. ✅ 可用 pointermove 控制籃子左右移動
4. ✅ 接到星星會 + 分數，且播放 catch 音效
5. ✅ 漏接會扣生命且播放 miss 音效
6. ✅ 生命歸零顯示 Game Over（可 Restart）
7. ✅ 難度確實會隨時間提升（至少速度或密度其一）
8. ✅ 離開頁面不會繼續佔用 CPU（動畫與監聽已清理）

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
