---
title: "Kanban & Worker 狀態視覺化網站 — 研究計畫書"
version: "v1.1.0"
date: "2026-06-15"
status: "approved"
---

# Kanban & Worker 狀態視覺化網站 — 研究計畫書

> **目標 (Goal)**
> 規劃並交付一個純前端的即時儀表板網站，把 Hermes Kanban 看板（任務狀態）和各 Worker Profile（線程運作狀態）視覺化呈現，帶有流暢的進入與狀態切換動畫，方便營運者一眼掌握系統全貌。

**範圍 (Scope)**: 規劃 + 設計 + 開發任務清單（不實作程式碼）。
**架構 (Architecture)**: 單頁應用 (SPA) — 純 HTML + CSS + Vanilla JS，無後端、無建置工具；資料來自 `hermes kanban` CLI 與各 profile 的 `gateway.pid`。
**技術棧 (Tech Stack)**: HTML5, CSS3 (animations), Vanilla JavaScript (ES2020+), Mermaid（架構圖）。

---

## 1. 背景與現況 (Context)

### 1.1 系統環境

Hermes Kanban 是 SQLite 為底、跨 profile 共享的任務系統；每個 profile (`worker1` / `worker2` / `default`) 各自運行一個 `hermes-gateway` 行程。當前實況：

- 任務資料存放於 `~/.hermes/kanban.db`（SQLite）。
- 每個 profile 的狀態以 `~/.hermes/profiles/<name>/gateway.pid` 紀錄，pid 檔案內容是 `{ "pid": <int>, "kind": "hermes-gateway", "argv": [...], "start_time": <float> }`。
- `hermes kanban list --json` 回傳所有任務的快照。
- `hermes kanban assignees --json` 回傳每個 profile 的任務計數（依 status 分組）。
- 單一任務透過 `hermes kanban show <id> --json` 取得完整 events / comments / runs（用於「點擊卡片看細節」）。

### 1.2 已驗證的資料模型（從真實 CLI 輸出取得）

**Task 主要欄位**：
```
id, title, body, assignee, status, priority, tenant, workspace_kind,
workspace_path, branch_name, created_by, created_at, started_at,
completed_at, result, skills, max_retries, session_id,
workflow_template_id, current_step_key
```

> ⚠ **`hermes kanban list --json` 不回傳 `events` 與 `runs` 詳細 metadata**（只有 `hermes kanban show <id> --json` 才有）。F8 modal 需要 heartbeat 時間，所以 fetch_data.sh 必須另外對每個 task 各跑一次 `show --json` 寫到 `tasks/<id>.json`。詳見 `architecture.md` §3 與 §8.1。

**status 取值**：`ready` / `running` / `blocked` / `done` / `archived` / `scheduled` / `triage`（看板生命週期）。

**Assignee 輸出**：
```json
[{ "name": "default", "on_disk": true, "counts": {} },
 { "name": "worker1", "on_disk": true, "counts": {"running": 2} },
 { "name": "worker2", "on_disk": true, "counts": {} }]
```

**Run 內嵌於 task**：`runs: [{id, profile, status, outcome, summary, error, metadata, started_at, ended_at}]`。

### 1.3 痛點

目前沒有任何 web 介面可以「一眼看到」整個系統狀態。營運者必須：
1. 開三個 terminal 分別查三個 profile 的 pid。
2. 跑 `hermes kanban list` 找任務。
3. 跑 `hermes kanban show <id>` 看單一任務的細節。

這個網站把上述三件事整合成一個儀表板。

---

## 2. 目標使用者 (Audience)

| 角色 | 使用情境 | 關注重點 |
|---|---|---|
| 系統營運者 (Operator) | 平時巡檢、debug 卡住的工作流 | 即時狀態、卡住的任務、心跳逾時 |
| 多 profile 協調者 (Orchestrator) | 跨 worker 派工時確認負載 | 各 profile 負載分布、待派任務 |
| 終端使用者（觀察用） | 想看 agent 系統長什麼樣 | 視覺美感、動畫效果 |

---

## 3. 功能需求 (Functional Requirements)

### 3.1 必做 (Must-have)

| ID | 功能 | 驗收標準 |
|---|---|---|
| F1 | 顯示所有 Kanban 任務卡片 | 載入時呼叫 `hermes kanban list --json`，用 grid 呈現所有任務 |
| F2 | 任務卡片顯示狀態徽章 | 卡片角落顯示 status，並用顏色區分（ready=藍、running=綠、blocked=紅、done=灰…） |
| F3 | 顯示三個 profile 的運作狀態 | 頂部 hero 區塊顯示 worker1/worker2/default + 在線指示燈（線上=綠、離線=紅） |
| F4 | 顯示每個 profile 的任務負載 | 每個 profile 旁邊顯示 `running: N` 計數 |
| F5 | 卡片入場動畫 | 載入或新卡片加入時，從下方 fade + slide-up 進場（200-400ms） |
| F6 | 狀態切換過渡動畫 | 同一張卡片從 running → done 時，狀態徽章有顏色 transition（300ms） |
| F7 | 自動輪詢更新 | 預設 5 秒輪詢一次 `hermes kanban list --json`；可手動暫停/重啟 |
| F8 | 點擊卡片彈出細節 modal | 顯示該 task 的 `started_at` / `created_at` / `body` 摘要 / 最後一次 heartbeat 時間。**注意**：`hermes kanban list --json` 不含 `events` 欄位，modal 開啟時需另外抓 `tasks/<id>.json`（由 fetch_data.sh 預先生成，詳見 `architecture.md` §3） |

### 3.2 應做 (Should-have)

| ID | 功能 | 驗收標準 |
|---|---|---|
| F9 | 依 status 篩選 | 頂部有 chip filter：全部 / ready / running / blocked / done |
| F10 | 依 assignee 篩選 | 點 profile 頭像可單獨看該 profile 的任務 |
| F11 | 排序 | 可依 created_at / started_at 排序 |
| F12 | 連線錯誤提示 | 若 `hermes` CLI 失敗，顯示 banner：「CLI 呼叫失敗，X 秒後重試」 |
| F13 | 鍵盤快速鍵 | `r` = 立即重抓、`p` = 暫停/恢復輪詢、`/` = focus 搜尋 |

### 3.3 可做 (Could-have)

| ID | 功能 |
|---|---|
| F14 | 暗 / 亮主題切換 |
| F15 | WebSocket 模式（若未來 Hermes 提供 streaming API，僅需改 fetcher） |
| F16 | 將卡片拖曳到不同欄（Kanban 視圖） |

---

## 4. 非功能需求 (Non-Functional)

- **零依賴 (Zero-dep)**: 不用 React/Vue/Tailwind/任何 build tool。瀏覽器開檔即用。
- **可離線 (Offline)**: 除了一開始抓 JSON，不再發任何網路請求。
- **效能**: 50 張卡片內無卡頓；輪詢 debounce 防止 race condition。
- **可近用 (a11y)**: 鍵盤可操作；狀態有顏色同時也有圖示 / 文字（不只靠顏色辨識）。
- **可移植**: 整個專案就一個 `index.html` + 外部 CSS/JS 檔（外加一個 JSON fetcher sh），丟到任何地方都能跑。

---

## 5. 互動設計原則 (Interaction Principles)

1. **單一事實來源 (Single source of truth)**: UI 永遠反映最新一次 CLI 結果；本機的 mutate 只用於樂觀 UI。
2. **最小驚喜**: 動畫 ≤ 400ms，狀態變化要平順而非彈跳。
3. **可逆性**: 任何點擊都能關閉（Esc 關 modal、`p` 暫停輪詢）。
4. **去耦**: fetcher 抽象成一個 `dataSource.fetch()` 介面，未來切 WebSocket 只要改實作。

---

## 6. 風險與決策 (Risks & Decisions)

| 風險 | 影響 | 緩解 |
|---|---|---|
| 每次輪詢都 spawn 一次 `hermes` CLI，CPU 開銷大 | 高頻更新時拖累主機 | (1) 預設 5s 間隔 (2) 用 `nohup` cache 一次結果 (3) 提供暫停按鈕 |
| 多個瀏覽器 tab 同時開 → 同時輪詢 | 重複 CLI 呼叫 | 加註：未來可加一個小型 `proxy.py`；本期不做 |
| `hermes` CLI 改了 JSON schema | UI 解析失敗 | fetcher 內部做 schema 驗證，欄位缺失時降級為「未知」並 log |
| pid 檔被外部手動刪除 | online 狀態誤判 | 嘗試 `kill -0 <pid>` 二次確認 |
| Mermaid 在 strict CSP 下失效 | 架構圖看不到 | 用 mermaid CDN with `defer`；提供 fallback 文字描述 |

---

## 7. 範例場景 (User Stories)

### 場景 A：營運者早上一打開
> 9:00 打開瀏覽器看儀表板 → 看到 worker1 線上（綠燈）、worker2 線上、default 離線（紅燈）。
> hero 區塊下方有兩張 running 卡片：PopChill 研究報告（已跑 12 分鐘）、Kanban 規劃（我現在這個）。
> 點 Kanban 規劃卡片 → modal 顯示 created_at 09:00、started_at 09:00、heartbeat 09:01。

### 場景 B：任務卡住
> 看到某任務狀態徽章變黃色（heartbeat 過期 > 5 min），可點「ping」按鈕讓 dashboard 自己呼叫 `kanban heartbeat` 重啟（本期不做、留 hook）。

### 場景 C：手動暫停輪詢
> 開發者要看 modal 內某張卡片的完整事件流 → 按 `p` 暫停輪詢 → 點卡片開 modal → 看完按 `p` 恢復。

---

## 8. 範圍外 (Out of Scope)

- 不實作任何寫入操作（complete / block / claim 全部不做；這是「只讀儀表板」）。
- 不實作 WebSocket（本期只用 polling）。
- 不做使用者登入 / 權限（這是本機工具）。
- 不打包成 PWA。

---

## 9. 交付物 (Deliverables)

| 路徑 | 說明 |
|---|---|
| `/tmp/kanban-dashboard/research-plan.md` | 本文件 |
| `/tmp/kanban-dashboard/architecture.md` | 架構設計 + Mermaid 圖 |
| `/tmp/kanban-dashboard/tasks.md` | 開發任務清單（細到 2-5 分鐘可完成） |
| （後續實作）`/tmp/kanban-dashboard/index.html` | 單頁儀表板 |
| （後續實作）`/tmp/kanban-dashboard/styles.css` | 樣式 + 動畫 |
| （後續實作）`/tmp/kanban-dashboard/app.js` | 輪詢 + 渲染邏輯 |
| （後續實作）`/tmp/kanban-dashboard/fetch_data.sh` | 呼叫 CLI 輸出 JSON 的 shim |

---

## 10. 開放問題 (Open Questions)

無（本規劃階段已從實際 CLI 輸出驗證資料模型，足以往下進行架構與任務切分）。
