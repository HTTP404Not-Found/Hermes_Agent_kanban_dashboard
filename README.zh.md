# Kanban Dashboard

> 即時呈現 Hermes Kanban 任務看板，含工作者狀態監控與輪詢更新。

**即時展示**：`http://140.245.120.154:3000/`  
**專案庫**：[HTTP404Not-Found/Hermes_Agent_kanban_dashboard](https://github.com/HTTP404Not-Found/Hermes_Agent_kanban_dashboard)

一個單頁式前端，把正在運行的 [Hermes Agent](https://github.com) Kanban 資料庫即時可視化：任務卡片、各 profile gateway 健康狀態、任務詳情彈窗、狀態／負責人／排序篩選器。前端是純 HTML + 原生 JS；後端是一支小型的 bash + Python 管線，把 Hermes CLI 輸出快照成 JSON 檔，由靜態伺服器送出。

---

## 目錄

1. [功能特色](#功能特色)
2. [架構](#架構)
3. [技術棧](#技術棧)
4. [快速啟動](#快速啟動)
5. [專案結構](#專案結構)
6. [輪詢與效能](#輪詢與效能)
7. [Profile 健康檢查](#profile-健康檢查)
8. [執行測試套件](#執行測試套件)
9. [部署](#部署)
10. [自訂調整](#自訂調整)
11. [疑難排解](#疑難排解)
12. [版本與文件對照](#版本與文件對照)
13. [授權](#授權)

---

## 功能特色

- **即時輪詢** — 每 1 秒刷新快照（可調整）。
- **工作者即時狀態** — `default`、`worker1`、`worker2`、`worker3` 各 profile 的上線／離線指示燈，透過 `gateway.pid` 健康檢查驅動。
- **任務卡片網格** — 所有 Kanban 任務以卡片呈現，含狀態標籤、負責人、年齡、標題。
- **展開／收合** — 預設只顯示前 8 張卡片，點「看更多」展開全部。
- **篩選列** — 可依狀態、負責人篩選，或切換排序（新到舊／舊到新／依狀態）。
- **任務詳情彈窗** — 點任一卡片，檢視完整任務內容、留言、活動事件、父／子任務連結。
- **深色科技風格** — CSS 動畫：載入淡入、懸停上浮、上線脈衝指示燈。
- **純原生 JS** — 無建置步驟、無 npm、無 bundler；打開 `index.html` 就能用。
- **後端 3 個小模組** — `app/poller.mjs`、`app/diff.mjs`、`app/filter.mjs`，每個都有單元測試。

---

## 架構

```
┌──────────────────────────────────────────────────────────────────┐
│                       瀏覽器（SPA）                              │
│  index.html + app.js + styles.css                                │
│  ├── Poller  (app/poller.mjs)  ── 輪詢 /snapshot.json            │
│  ├── Diff    (app/diff.mjs)    ── added/removed/changed 事件     │
│  ├── Filter  (app/filter.mjs)  ── 狀態／負責人／排序              │
│  └── Renderer                  ── 重繪卡片網格 + 開啟彈窗         │
└───────────────────────────┬──────────────────────────────────────┘
                            │ GET /snapshot.json  +  GET /tasks/<id>.json
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  靜態檔案伺服器（Node server.js  或  python3 -m http.server）     │
│  通訊埠 3000  ·  將 /tmp/kanban-dashboard/ 當靜態檔案托管         │
└───────────────────────────┬──────────────────────────────────────┘
                            │ 每 1 秒
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  fetch_data.sh                                                   │
│  ├── hermes kanban list --json                                   │
│  ├── hermes kanban assignees --json                              │
│  ├── gateway.pid 健康檢查（每個 profile 用 kill -0）             │
│  ├── 寫入 /tmp/kanban-dashboard/snapshot.json                    │
│  └── 寫入 /tmp/kanban-dashboard/tasks/<id>.json（平行）          │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  Hermes Kanban 資料庫  &  Gateway 行程                           │
│  ├── ~/.hermes/kanban.db                    （SQLite）            │
│  ├── ~/.hermes/gateway.pid                  （default profile）   │
│  └── ~/.hermes/profiles/<name>/gateway.pid  （worker1/2/3）      │
└──────────────────────────────────────────────────────────────────┘
```

資料單向流動：CLI → `snapshot.json` → HTTP → 瀏覽器模組 → DOM。每個瀏覽器模組都是 snapshot 上的純函式——好測試、好替換。

更深入的設計筆記請見 [`architecture.md`](./architecture.md)（v1.1.0）與 [`research-plan.md`](./research-plan.md)。

---

## 技術棧

| 層       | 選擇                                                       |
|---------|------------------------------------------------------------|
| 前端     | 原生 JavaScript（ES2022），無框架、無建置步驟               |
| UI 模組  | `app/` 下 3 個純函式模組（poller、diff、filter）           |
| 樣式     | 純 CSS + 自訂屬性 + 關鍵影格動畫                            |
| 靜態伺服器 | Node.js `http` 模組（`server.js`，ESM，含 `.mjs` MIME 對應） |
| 快照產生 | Bash（`fetch_data.sh`）+ Python3 heredoc 組合 JSON          |
| 輪詢迴圈 | Bash（`_loop.sh`，`sleep 1` 包裝）                          |
| 後端     | Hermes Agent CLI（`hermes kanban list/assignees/show`）     |

需要 Node.js ≥ 18 以使用 `node:http`、`node:fs/promises`、`node:test` 等 API。

---

## 快速啟動

### 1. 啟動靜態檔案伺服器

```bash
# 方式 A — Node.js（建議，含 .mjs MIME 對應）
node /tmp/kanban-dashboard/server.js

# 方式 B — Python 3（無 Node 相依）
cd /tmp/kanban-dashboard && python3 -m http.server 3000
```

Node 伺服器綁定 `0.0.0.0:3000`（任意介面、port 3000）。即時觀察 log：

```bash
tail -f /tmp/kanban-dashboard/server.log   # 若自行把 stdout 導向此檔
```

### 2. 啟動輪詢迴圈

```bash
# 手動執行一次（強制刷新）
bash /tmp/kanban-dashboard/fetch_data.sh

# 持續執行（每 1 秒）
bash /tmp/kanban-dashboard/_loop.sh &
```

`fetch_data.sh` 冪等，且以**原子寫入**（先寫 tmp 再 `mv`）產生 `snapshot.json`，瀏覽器永遠不會讀到寫一半的檔。

### 3. 開啟瀏覽器

```
http://localhost:3000/
```

遠端存取：`http://140.245.120.154:3000/`

---

## 專案結構

```
kanban-dashboard/
├── index.html            # 主 HTML 進入點（lang="zh-Hant"，單頁式）
├── app.js                # SPA 啟動 + DOM 膠水（呼叫 app/* 模組）
├── styles.css            # 深色主題 + CSS 動畫
│
├── app/                  # 瀏覽器端純函式模組（ESM）
│   ├── poller.mjs        #   輪詢 /snapshot.json，提供 start/pause/resume API
│   ├── diff.mjs          #   計算 added / removed / changed 事件
│   └── filter.mjs        #   依狀態／負責人篩選 + 多種排序
│
├── tests/                # Node.js 原生測試執行器（node --test）
│   ├── poller.test.mjs   #   9 個測試
│   ├── diff.test.mjs     #   9 個測試
│   └── filter.test.mjs   #  16 個測試
│
├── server.js             # Node.js 靜態檔案伺服器（port 3000）
├── fetch_data.sh         # 快照 Hermes CLI 輸出 → snapshot.json + tasks/<id>.json
├── _loop.sh              # 包裝腳本：每 1 秒執行 fetch_data.sh
│
├── snapshot.json         # 產出檔案（每 1 秒刷新）
├── tasks/<id>.json       # 各任務詳情檔（events、comments、父／子連結）
│
├── architecture.md       # 系統架構文件（v1.1.0）
├── tasks.md              # 開發任務追蹤清單
├── research-plan.md      # 功能研究筆記
├── SECURITY_AUDIT.md     # 安全審計檢查清單
├── sample-snapshot.json  # 離線開發用 fixture
```

---

## 輪詢與效能

| 作業                                          | 時間           |
|----------------------------------------------|----------------|
| `hermes kanban list --json`                    | 約 0.5 秒      |
| `hermes kanban assignees --json`               | 約 0.5 秒      |
| 各任務詳情抓取（N 個，**平行**）              | 約 1.0 秒總計  |
| **快照完整刷新**                              | **約 1.1 秒**  |
| 瀏覽器端輪詢頻率                              | 1 秒（可調整） |

各任務詳情檔（`tasks/<id>.json`）以背景行程（`&` + `wait`）平行抓取——**任務數增加不會線性拉長抓取時間**，整批詳情都會被約 1 秒的上限鎖住，跟任務數無關。

瀏覽器端的 `app/poller.mjs` 提供 `start / stop / pause / resume / trigger / setInterval` API，會掛 `document.visibilitychange` 事件：分頁切到背景時自動暫停輪詢，避免堆疊未完成的請求。

---

## Profile 健康檢查

`fetch_data.sh` 用 `kill -0` 檢查每個 profile 的 `gateway.pid`。`default` profile 用的是非標準路徑：

| Profile   | PID 檔位置                              |
|-----------|-----------------------------------------|
| `default` | `~/.hermes/gateway.pid`                 |
| `worker1` | `~/.hermes/profiles/worker1/gateway.pid` |
| `worker2` | `~/.hermes/profiles/worker2/gateway.pid` |
| `worker3` | `~/.hermes/profiles/worker3/gateway.pid` |

狀態語意（都是正常狀態，不是錯誤）：

- **ONLINE** — PID 檔存在 + 行程對 `kill -0` 有回應。
- **OFFLINE · no_pid_file** — PID 檔不存在（該 profile 尚未啟動——合法）。
- **OFFLINE · pid_dead** — PID 檔存在但行程已終止。

`fetch_data.sh` 刻意不用 `set -e`，因為 `hermes kanban list` 在 race condition 下偶爾會回非零；寫出部分快照永遠比什麼都沒寫好。

---

## 執行測試套件

三個瀏覽器模組各有專屬的 `node --test` 檔，總計 **34 個測試，全部通過**：

```bash
cd /tmp/kanban-dashboard

# 跑全部
node --test tests/*.test.mjs

# 一次只跑一個檔
node --test tests/poller.test.mjs
node --test tests/diff.test.mjs
node --test tests/filter.test.mjs
```

預期輸出（最後 3 行）：

```
# tests 34
# pass 34
# fail 0
```

測試使用 Node 內建的測試執行器——**沒有任何第三方測試框架**。測試在 process 內執行，所以很快（34 個測試 < 1 秒）、無需額外設定。

---

## 部署

### systemd 服務（正式環境建議）

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

輪詢迴圈（`_loop.sh`）設計成另一個 systemd `--user` 服務，或在 `tmux` / `screen` / `nohup` 下執行。沒有內建 supervisor——選一個符合你維運模式的工具即可。

### 公開存取（無內建驗證）

此儀表板無驗證機制。建議只綁定 localhost，或透過 Cloudflare Tunnel 對外：

```bash
# 預設——綁定 0.0.0.0:3000（任意介面）
node /tmp/kanban-dashboard/server.js

# 公開存取的建議作法
cloudflared tunnel --url http://localhost:3000
```

**不要把 port 3000 直接暴露在公開網路上而不加驗證層**——`snapshot.json` 與 `tasks/<id>.json` 都是世界可讀。

---

## 自訂調整

| 參數             | 預設值 | 改動位置                   | 效果                              |
|------------------|--------|---------------------------|----------------------------------|
| `POLL_INTERVAL`  | `1`    | `_loop.sh`（`sleep` 參數） | 快照寫入間隔（秒）                |
| `INITIAL`        | `8`    | `app.js`（約第 187 行）    | 「看更多」按鈕前預設顯示的卡片數  |
| `PORT`           | `3000` | `server.js`（`PORT` 常數） | 靜態伺服器通訊埠                  |

調慢輪詢頻率，編輯 `_loop.sh`（在低階開發機上很有用）：

```bash
sleep 5   # 原值 1——改為每 5 秒刷新
```

調整預設顯示卡片數，編輯 `app.js`：

```javascript
const INITIAL = 12;  // 原值 8——預設顯示 12 張卡片
```

---

## 疑難排解

| 症狀                                              | 原因                                          | 解法                                                                                          |
|---------------------------------------------------|------------------------------------------------|----------------------------------------------------------------------------------------------|
| 所有 profile 都顯示 `OFFLINE · no_pid_file`       | `fetch_data.sh` 找錯 PID 檔路徑               | 確認 `default` 的 `~/.hermes/gateway.pid` 存在；workers 的 `~/.hermes/profiles/*/gateway.pid` 存在 |
| 快照沒有更新                                      | `_loop.sh` 沒在跑                              | `bash /tmp/kanban-dashboard/_loop.sh &`                                                      |
| 儀表板顯示 0 個任務                                | `hermes kanban list` 回傳空值                  | 手動 `hermes kanban list --json`；檢查 DB 路徑                                                 |
| 瀏覽器顯示過時資料                                | 快取或 `snapshot.json` 太舊                    | 強制重新整理（Ctrl+Shift+R）；檢查 `ls -l /tmp/kanban-dashboard/snapshot.json` 的 mtime         |
| `.mjs` 檔被當 `text/plain` 送出                   | 伺服器沒對應到 MIME 型別                      | 用 Node 的 `server.js`（有 MIME 對應表）；Python 內建伺服器可能不會送對                          |
| 彈窗開啟但沒有 events / comments                  | `tasks/<id>.json` 沒寫到磁碟                  | 確認 `fetch_data.sh` 有權限寫入 `tasks/`，且平行背景 `&` 行程有跑完                              |
| `node --test` 對資料夾執行回報 `fail 1`           | 三個檔同時載入時的已知競態                     | 一次只跑一個檔，或用 `node --test tests/*.test.mjs`（glob 形式可避開）                          |

---

## 版本與文件對照

| 文件                     | 版本    | 用途                                              |
|--------------------------|---------|---------------------------------------------------|
| `README.md`（本檔）       | v1.2.0  | 使用者導向的入門與維運指南（English）              |
| `README.zh.md`           | v1.2.0  | 使用者導向的入門與維運指南（中文）                 |
| `architecture.md`          | v1.1.0  | 設計文件——模組、資料流、錯誤處理                  |
| `research-plan.md`       | v1.1.0  | 功能研究、使用者故事、風險矩陣                    |
| `tasks.md`               | v1.2.0  | 逐項開發任務追蹤                                  |
| `SECURITY_AUDIT.md`      | v1.2.0  | 安全審計檢查清單                                  |

每個出貨的原始檔都帶有 `<!-- v1.0.0 | 2026-06-15 -->` 標記，可用 grep 一次看完整個 v1.0.0 釋出涵蓋哪些檔案：

```bash
grep -rn "v1.0.0 | 2026-06-15" .
```

---

## 授權

MIT