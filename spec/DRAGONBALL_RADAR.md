# 龍珠雷達（Dragon Ball Radar）— 規劃 / 規格

## 目標
在 `games` 專案新增一個小遊戲頁面：**龍珠雷達**。

- 畫面核心是一個「雷達圖」會持續掃描（旋轉掃描線 + 餘暉）。
- 使用**真實座標**：以瀏覽器 Geolocation API 取得玩家目前 GPS（lat/lng）。
- 目標物為多個「龍珠座標點」，**無順序**（接近任一點即可取得）。
- 依距離產生「拉近（zoom-in）」效果：越接近目標，雷達的顯示範圍越小、目標點越大/越亮。
- 當距離小於成功門檻時，顯示「成功找到」。
- 不顯示 Google Map（純雷達 UI）。

## 路由 / 入口
- 新增路由：`/dragonball-radar`
- 首頁（`/`）遊戲清單新增：`龍珠雷達` → `/dragonball-radar`

## 座標與距離
### 目標/地標座標
- 使用 WGS84 經緯度。

### 龍珠座標點
- 初始值（可調）：
  - 新竹火車站：`24.801588, 120.971794`
  - 巨城購物中心：`24.809449, 120.9727305`
  - 新竹市香山綜合運動場：`24.797, 120.949`

> 註：可視需要再校正精度；先以一般公開資料座標作為 MVP。

### 距離計算
- 使用 Haversine formula 計算玩家位置與目標點的距離（公尺）。

## 雷達視覺（Canvas）
- Canvas 固定正方形（例如 320x320 或依容器縮放）。
- 元素：
  1) 圓形雷達框 + 同心圓刻度
  2) 旋轉掃描線（每秒 ~ 1 轉，可調）
  3) 目標 blip（點）
  4) 餘暉效果：每幀以低 alpha 填充黑色，保留前幀殘影

### 目標點位置
- 以玩家為中心（雷達中心）。
- 將 (targetLatLng - userLatLng) 轉為近似的 local ENU 平面座標（m）：
  - `dx = (lng2-lng1) * cos(lat) * R`
  - `dy = (lat2-lat1) * R`
- 把 dx,dy 映射到雷達半徑。

## 拉近（Zoom）/ 比例尺規則
- 雷達顯示半徑 `rangeMeters` **以「最近的標記點」為主**自動縮放。
- 近距離時會拉近（range 變小），遠距離時會拉遠（range 變大）。
- 超出 `rangeMeters` 的點一律 **clamp 到最外圈**（仍可看到方向）。

建議（MVP）演算法：
- `nearest = min(distanceToEachTarget)`
- `rangeMeters = clamp(max(60, nearest * 1.15), 60, 4000)`
- Map zoom 可用分段或由 `nearest` 推估。

- 目標點大小/亮度：距離越近越大越亮。

## 成功條件 / 進度保存
- 任一龍珠：`distanceToTarget <= successRadiusMeters` → 標記為「已找到」
- successRadiusMeters：先用 30m（可調）
- 進度使用 `localStorage` 保存（重整頁面不會消失）
- 當所有龍珠都已找到：顯示「全部找到」並提供「重玩（清除紀錄）」

## 權限 / UX
- 頁面進入時：顯示「啟動定位」按鈕 + 權限說明。
- 使用 `navigator.geolocation.watchPosition`：
  - `enableHighAccuracy: true`
  - `maximumAge: 1000`
  - `timeout: 10000`
- 若定位失敗：顯示錯誤原因並提示開啟定位。

## 驗收
- `npm run dev` 可進入 `/dragonball-radar`
- 雷達掃描線持續運作
- 有取得定位時顯示距離與方向（目標點相對位置）
- 接近時 range 會縮小（拉近效果）
- 進入成功半徑顯示「成功找到」
- build 成功
