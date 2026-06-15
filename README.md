# Kanban Dashboard — Backend (Phase 0-1)

即時視覺化 Hermes Kanban 任務與 worker profile 狀態的零依賴靜態 SPA 後端。

本目錄（`/tmp/kanban-dashboard/`）目前交付 **Phase 0 + Phase 1**：

- **Phase 0 — 環境與資料鏈**：`fetch_data.sh` 把 hermes CLI 輸出合併成 `snapshot.json`
  + 逐個 task 寫 `tasks/<id>.json`（含 events），給前端 modal 開啟時查 heartbeat。
- **Phase 1 — 核心邏輯層**：Poller / Diff / Filter 三個純函式模組 + `node --test`
  完整覆蓋。Phase 2+（HTML / CSS / app.js 整合）尚未實作。

## 檔案結構

```
kanban-dashboard/
├── app/
│   ├── poller.mjs     # 輪詢器：start/stop/pause/resume/trigger/setInterval/on
│   ├── diff.mjs       # 純函式 Diff 引擎：added/removed/changed 事件流
│   └── filter.mjs     # 純函式 Filter & Sort：status/assignee/sort
├── tests/
│   ├── poller.test.mjs  # 9 tests
│   ├── diff.test.mjs    # 9 tests
│   └── filter.test.mjs  # 16 tests
├── fetch_data.sh         # 合併 list + assignees + pid 健康檢查 → snapshot.json
├── sample-snapshot.json  # 固定 fixture（純前端開發用，shape 等同 fetch_data 輸出）
├── snapshot.json         # fetch_data.sh 執行期產物（給靜態伺服器讀）
├── tasks/<id>.json       # fetch_data.sh 執行期產物（含 events，給 modal 查 heartbeat）
├── index.html            # Phase 2 預備（空殼）
├── styles.css            # Phase 2 預備（空殼）
├── app.js                # Phase 3 預備（空殼）
├── README.md             # 本檔
├── architecture.md       # 系統架構（不變）
├── research-plan.md      # 研究紀錄（不變）
└── tasks.md              # 任務清單（不變）
```

## 啟動方式

### 0. 抓一次 snapshot

```bash
cd /tmp/kanban-dashboard
./fetch_data.sh
# 產出 snapshot.json + tasks/<id>.json
```

### 1. 跑測試

```bash
node --test tests/*.test.mjs
# 預期 34/34 全綠
```

### 2. 每 5 秒自動抓資料（cron 替代方案）

若系統是傳統 cron（無秒欄位），用 while 迴圈：

```bash
nohup bash -c 'while true; do
  /tmp/kanban-dashboard/fetch_data.sh
  sleep 5
done' > /tmp/kanban-dashboard/loop.log 2>&1 &
```

若系統支援 vixie-cron / cronie（5 欄位 + 秒）：

```bash
(crontab -l 2>/dev/null; echo "*/5 * * * * * /tmp/kanban-dashboard/fetch_data.sh") | crontab -
```

### 3. 啟動靜態檔案伺服器

```bash
python3 -m http.server 8000 --directory /tmp/kanban-dashboard
# 瀏覽器開 http://localhost:8000/snapshot.json 看資料
```

## 設計重點

### fetch_data.sh
- 不使用 `set -e`：hermes CLI 偶爾 race condition 回非零仍要把當下可取得的資料寫出去
- 不用 shell 拼 JSON：用 `python3 <<'PY'` heredoc 一次構造 JSON
- 原子寫入：先寫 `tmp.$$` 再 `mv`
- pid 檔缺失（worker3 可能缺檔）視為合法離線狀態，不報錯
- pid 檔存在但行程已死：`online=false` + stderr warning，但**不主動刪 pid 檔**（forensics）

### Poller 模組
- in-flight 重疊防護：fetcher 還在跑就不會啟動下一次
- `pause`/`resume` 期間暫停排程；`resume` 時立刻補一次
- `trigger()` 強制立即觸發一次（給 Refresh 鈕用）
- `setInterval(ms)` 動態改週期（給 degraded mode 用）
- 錯誤不中斷輪詢，走 `onError` callback + `error` 事件

### Diff 模組
- 純函式，輸入 Map<id, Task>，輸出事件流
- `changed` 事件附帶 `changes: [fieldName, ...]` 明細，方便前端觸發
  對應欄位的高亮動畫（status 變 → pulse badge；assignee 變 → 換頭像）

### Filter 模組
- 純函式，不修改原陣列
- `status="all"` / `assignee="all"` 視為不限
- 未知 status/sort 不拋例外（防呆），由呼叫端決定 fallback
- 支援三種排序：`created_desc`（預設）、`created_asc`、`title_asc`

## 測試覆蓋

| Suite | Tests | 重點 |
|---|---|---|
| poller | 9 | 啟動/停止/暫停恢復/trigger/setInterval/錯誤處理/冪等/in-flight |
| diff | 9 | added/removed/changed/無變化/null 輸入/多欄位同時變化 |
| filter | 16 | status/assignee/sort/組合/防呆/pure function |
| **總計** | **34** | 全綠，無外部依賴 |

執行：
```bash
cd /tmp/kanban-dashboard
node --test tests/*.test.mjs
```

## 版本

`<!-- v1.0.0 | 2026-06-15 -->` — Phase 0-1 後端初版
