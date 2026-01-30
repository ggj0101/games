# Firebase + GitHub Pages：番茄鐘（Pomodoro）資料同步規格（草案）

> 目的：
> - 前端部署在 GitHub Pages（靜態站）
> - 使用 Firebase 作為免費遠端資料庫
> - 番茄鐘/小遊戲的紀錄可跨裝置同步
> - 安全：使用者只能讀寫自己的資料

---

## 1) 使用的 Firebase 服務

1. **Firebase Authentication**（建議啟用）
   - MVP：Google Sign-in
   - 目標：讓資料以 `uid` 分區，方便做安全規則

2. **Cloud Firestore**（主要資料庫）
   - 儲存番茄鐘回合紀錄、設定、統計

3. （可選）Firebase Hosting
   - 目前仍使用 GitHub Pages → 可不啟用

---

## 2) Firestore 資料模型（建議）

### 2.1 Collections

- `users/{uid}`
  - `displayName: string`（可選）
  - `createdAt: timestamp`（可選）

- `users/{uid}/pomodoroSessions/{sessionId}`
  - `startedAt: timestamp`
  - `endedAt: timestamp`
  - `mode: 'focus' | 'break'`
  - `label: string`（使用者輸入，可空）
  - `durationSec: number`
  - `result: 'done' | 'cancel'`

> 註：此設計可讓「每個使用者只能看到自己的資料」，且方便未來做每日統計。

---

## 3) Firestore 安全規則（Rules）

在 Firestore → Rules 設定為：

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      match /pomodoroSessions/{docId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

安全目標：
- 未登入者不可讀寫
- 登入後僅能讀寫自己的 `users/{uid}` 節點

---

## 4) 前端整合（Vite + Vue）

### 4.1 依賴

```bash
npm i firebase
```

### 4.2 初始化檔案（範例）

建議新增：`src/lib/firebase.ts`

```ts
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID
  // 其餘欄位視需要補齊
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
export const db = getFirestore(app)
```

### 4.3 環境變數（GitHub Pages）

- 不要把 secrets 直接寫死在 repo。
- 建議：使用 GitHub Actions Secrets 在 build 時注入 `VITE_FIREBASE_*`。

---

## 5) 同步策略（建議）

- 優先採用「回合結束才寫入」：
  - 降低 Firestore read/write 成本
  - 避免即時 listener 過多

---

## 6) 免費額度注意事項

- 番茄鐘這類寫入頻率低的應用通常免費足夠。
- 成本風險來源：
  - 過度使用即時監聽（realtime listeners）
  - 頻繁輪詢/大量讀取
  - 儲存大量 blob（圖、音）

---

## 7) 待確認事項（之後審視）

1. 是否要支援匿名登入（anonymous auth）？
2. 是否要同步設定（settings）？存放路徑：`users/{uid}/settings/default`？
3. 是否要做每日統計（daily summary）？
4. 是否需要團隊/排行榜（跨使用者讀取）？（會影響 rules 與資料模型）
