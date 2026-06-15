# Kanban Dashboard

> 即時呈現 Hermes Kanban 任務看板，含工作者狀態監控與輪詢更新。

**即時展示**：`http://140.245.120.154:3000/`  
**專案庫**：[HTTP404Not-Found/Hermes_Agent_kanban_dashboard](https://github.com/HTTP404Not-Found/Hermes_Agent_kanban_dashboard)

---

## 功能特色

- **即時輪詢** — 每 1 秒刷新快照（可調整）
- **工作者即時狀態** — 顯示 `default`、`worker1`、`worker2`、`worker3` 各 profile 的上線/離線狀態
- **任務卡片網格** — 所有 Kanban 任務以卡片呈現，含狀態標籤、負責人、年齡
- **展開／收合** — 預設只顯示前 8 張卡片，點「看更多」展開全部
- **篩選列** — 可依任務狀態、負責人、排序方式篩選
- **任務詳情彈窗** — 點擊任一卡片，檢視完整任務內容、留言與活動紀錄
- **深色科技風格** — CSS 動畫：載入淡入、懸停上浮、ONLINE 脈衝指示燈
- **零相依套件** — 純原生 JavaScript，前端無需 npm 套件

---

## 架構

```
┌─────────────────────────────────────────────────────────────────┐
│                        瀏覽器 (SPA)                              │
│  index.html + app.js + styles.css                               │
│  ├── Poller：每 1 秒抓取 snapshot.json                         │
│  ├── State：記憶體狀態（tasks、profiles、filter、UI）           │
│  └── Renderer：重繪任務網格、開啟彈窗                            │
└────────────────────────┬────────────────────────────────────────┘
                         │ GET /snapshot.json
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  靜態檔案伺服器（Node.js server.js 或 python3 -m http.server）   │
│  通訊埠 3000 | 將 /tmp/kanban-dashboard/ 靜態托管              │
└────────────────────────┬────────────────────────────────────────┘
                         │ cron / _loop.sh（每 1 秒）
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  fetch_data.sh                                                      │
│  ├── hermes kanban list --json                                   │
│  ├── hermes kanban assignees --json                              │
│  ├── gateway.pid 健康檢查（kill -0）                              │
│  └── 寫入：/tmp/kanban-dashboard/snapshot.json                   │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Hermes Kanban 資料庫與 Gateway 行程                              │
│  ├── ~/.hermes/kanban.db（SQLite）                               │
│  ├── ~/.hermes/gateway.pid（default profile）                    │
│  └── ~/.hermes/profiles/{worker1,2,3}/gateway.pid             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 技術棧

- **前端**：原生 JavaScript（ES6+），無框架
- **靜態伺服器**：Node.js `http` 模組（`server.js`）
- **資料收集**：Bash 指令稿 + Python3 JSON 處理
- **樣式**：純 CSS，含 CSS 變數、關鍵影格動畫
- **後端**：Hermes Agent CLI（`hermes kanban list/assignees`）

---

## 快速啟動

### 1. 啟動靜態檔案伺服器

```bash
# 方式 A：Node.js（建議）
node /tmp/kanban-dashboard/server.js

# 方式 B：Python
cd /tmp/kanban-dashboard && python3 -m http.server 3000
```

### 2. 啟動輪詢循環

```bash
# 手動執行一次
bash /tmp/kanban-dashboard/fetch_data.sh

# 或持續執行（每 1 秒）
bash /tmp/kanban-dashboard/_loop.sh &
```

### 3. 開啟瀏覽器

```
http://localhost:3000/
```

遠端存取：`http://140.245.120.154:3000/`

---

## 檔案結構

```
kanban-dashboard/
├── index.html          # 主 HTML 進入點
├── app.js             # SPA 邏輯：輪詢、狀態、渲染、彈窗
├── styles.css         # 深色主題 + CSS 動畫
├── server.js          # Node.js 靜態檔案伺服器（通訊埠 3000）
├── fetch_data.sh      # 抓取 kanban 資料 + profile 健康檢查
├── _loop.sh           # 包裝指令：每 1 秒執行 fetch_data.sh
├── snapshot.json      # 產出檔案（每 1 秒刷新）
├── architecture.md    # 系統架構文件
├── tasks.md           # 開發任務追蹤
├── research-plan.md   # 功能研究筆記
├── sample-snapshot.json # 離線開發用範例快照
└── screenshots/       # UI 截圖
```

---

## 輪詢與效能

| 作業 | 時間 |
|------|------|
| `hermes kanban list --json` | 約 0.5 秒 |
| `hermes kanban assignees --json` | 約 0.5 秒 |
| 各任務詳情抓取（N 個任務，平行） | 約 1.0 秒總計 |
| **快照完整刷新** | **約 1.1 秒** |
| 輪詢間隔（可調整） | 預設：1 秒（`_loop.sh`）|

任務詳情使用**平行化**（背景行程 `&` + `wait`），增加任務數不會線性增加抓取時間。

---

## Profile 健康檢查

各 profile 的 `gateway.pid` 以 `kill -0` 檢查：

| Profile | PID 檔位置 |
|---------|-----------|
| `default` | `~/.hermes/gateway.pid` |
| `worker1` | `~/.hermes/profiles/worker1/gateway.pid` |
| `worker2` | `~/.hermes/profiles/worker2/gateway.pid` |
| `worker3` | `~/.hermes/profiles/worker3/gateway.pid` |

- PID 檔不存在 → `OFFLINE · no_pid_file`（合法離線狀態，非錯誤）
- PID 檔存在但行程已終止 → `OFFLINE · pid_dead`

---

## 部署

### systemd 服務（建議用於正式環境）

```ini
[Unit]
Description=Hermes Kanban Dashboard
After=network.target

[Service]
ExecStart=/usr/bin/node /tmp/kanban-dashboard/server.js
Restart=always
WorkingDirectory=/tmp/kanban-dashboard

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable kanban-dashboard
systemctl --user start kanban-dashboard
```

### 公開存取（無驗證）

此儀表板無內建驗證機制。建議透過 Cloudflare Tunnel 暴露，或在網路層限制：

```bash
# 只綁定本機（僅本地存取）
node /tmp/kanban-dashboard/server.js  # 預設已綁定 0.0.0.0:3000

# 公開存取，建議用 Cloudflare Tunnel
cloudflared tunnel --url http://localhost:3000
```

---

## 自訂調整

| 參數 | 預設值 | 說明 |
|------|--------|------|
| `POLL_INTERVAL` | `1` | 輪詢間隔（秒） |
| `INITIAL_DISPLAY` | `8` | 預設顯示卡片數（點「看更多」前） |

調整輪詢間隔，編輯 `_loop.sh`：
```bash
POLL_INTERVAL=5  # 改為 5 秒
```

調整預設顯示卡片數，編輯 `app.js`：
```javascript
const INITIAL = 8;  // 改為顯示更多或更少卡片
```

---

## 疑難排解

| 症狀 | 原因 | 解法 |
|------|------|------|
| 儀表板所有 profile 顯示 `OFFLINE · no_pid_file` | `fetch_data.sh` 找錯 PID 檔路徑 | 確認 `default` 的 `~/.hermes/gateway.pid` 存在；workers 的 `~/.hermes/profiles/*/gateway.pid` 存在 |
| 快照未更新 | `_loop.sh` 未執行 | 執行 `bash /tmp/kanban-dashboard/_loop.sh &` |
| 顯示 0 個任務 | `hermes kanban list` 回傳空值 | 手動檢查 `hermes kanban list --json` 輸出 |
| 瀏覽器顯示過時資料 | 快取問題 | 強制重新整理（Ctrl+Shift+R）或檢查 `snapshot.json` 修改時間 |

---

## 授權

MIT
