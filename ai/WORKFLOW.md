# GAMES — AI Workflow (OpenSpec + Vue Skills)

本專案採用「混合模式」：
- **OpenSpec**：管理每一次變更（proposal/specs/design/tasks），避免需求只留在聊天紀錄。
- **Vue skills（best practices）**：在實作/重構 Vue 3 程式碼時，提供一致的工程規範。

> 這份文件是給 Codex / Gemini CLI / GitHub Copilot 看的「工作方式」。

---

## 0) 目錄定位

- `spec/`：產品/遊戲規格庫（你手寫的規格，如 StarCatcher、JellyMatch…）
- `openspec/changes/`：每次變更的工作資料夾（OpenSpec 自動產生與封存）
- `ai/`：本專案的 AI 規範（workflow + conventions）

---

## 1) 一次變更的標準流程（必走）

### Step A — 建立變更

在 repo 根目錄執行（或在你的 assistant 內輸入 slash command）：

- `/opsx:new <change-name>`

範例：
- `/opsx:new add-color-balloon-pop`
- `/opsx:new refactor-breakout-input`

### Step B — 生成 planning artifacts

- `/opsx:ff`（fast-forward）

產出內容通常包含：
- `proposal.md`
- `specs/`（需求/情境）
- `design.md`
- `tasks.md`

### Step C — 實作（同時遵守 Vue skills）

進入實作前，請在你的 prompt 前面加上：

- `Use vue skill, ...`

並且在實作時遵守：`ai/VUE_SKILLS.md` + `ai/PROJECT_CONVENTIONS.md`。

> 重點：OpenSpec 管「做什麼、怎麼驗收」；Vue skills 管「Vue/TS 要怎麼寫才穩」。

### Step D — 執行自我驗證

至少跑：
- `npm run lint`
- `npm run build`

（有對應測試才跑測試）

### Step E — 封存

- `/opsx:archive`

會將變更封存到：`openspec/changes/archive/`，並讓 repo 保持乾淨，準備下一個功能。

---

## 2) 變更粒度建議

在 GAMES 專案中，推薦把 change 以「一個可驗收的最小單位」拆分，例如：
- 新增一個遊戲入口 + 一個 view + 最小可玩 MVP
- 或只做「重構 cleanup / resize / input」
- 不要把 3 個遊戲一起塞進同一個 change

---

## 3) 重要原則（會影響穩定性）

- **每個遊戲必須可卸載（cleanup 必做）**：事件監聽、ticker、RAF、PIXI app、Phaser game 都要 destroy。
- **動態 import 大型依賴**（Pixi/Phaser/Leaflet 等），避免首頁 bundle 變大。
- **手機優先**：pointer 事件、`touch-action: none`、DPR resize。
