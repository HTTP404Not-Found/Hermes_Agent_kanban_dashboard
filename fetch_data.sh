#!/usr/bin/env bash
# fetch_data.sh — 合併 hermes kanban list + assignees + pid 健康檢查，輸出單一 JSON。
#
# 由 cron 每 5 秒觸發；輸出由 python3 -m http.server 當靜態檔案服務。
# 架構見 /tmp/kanban-dashboard/architecture.md §8。
#
# 用法：
#   ./fetch_data.sh [OUT_PATH]
#   OUT_PATH 預設 /tmp/kanban-dashboard/snapshot.json。
#
# 設計重點（見 architecture.md §8.2）：
#   - 不用 `set -e`：hermes CLI 偶爾回非零（race condition）仍要把當下可取得的
#     資料寫出去，partial snapshot 比 no snapshot 好。
#   - 不要在 shell 內拼 JSON：用 python3 heredoc 一次完成 JSON 構造，避免
#     shell quoting escape 把 JSON 弄壞。
#   - 原子寫入：先寫 tmp.$$ 再 mv，避免前端讀到半寫的檔。
#   - pid 檔缺失（worker3 可能缺檔）視為合法離線，不報錯。
#
# <!-- v1.0.0 | 2026-06-15 -->

set -uo pipefail

OUT_PATH="${1:-/tmp/kanban-dashboard/snapshot.json}"
OUT_DIR="$(dirname "$OUT_PATH")"
TASKS_DIR="${OUT_DIR}/tasks"
VERSION_TAG="<!-- v1.0.0 | 2026-06-15 -->"

LIST_JSON="$(hermes kanban list --json 2>/dev/null || echo '[]')"
ASSIGNEES_JSON="$(hermes kanban assignees --json 2>/dev/null || echo '[]')"

mkdir -p "$TASKS_DIR"

# 主 snapshot：合併 list + assignees + pid 健康檢查。
TMP_MAIN="$(mktemp "${OUT_DIR}/.snapshot.XXXXXX")"
export LIST_JSON ASSIGNEES_JSON OUT_DIR TASKS_DIR VERSION_TAG
python3 - "$TMP_MAIN" <<'PY'
import json, os, subprocess, sys, time

out_path = sys.argv[1]

def _safe_load(raw, default):
    if not raw or not raw.strip():
        return default
    try:
        return json.loads(raw)
    except Exception:
        return default

list_data = _safe_load(os.environ.get("LIST_JSON", ""), [])
assignees = _safe_load(os.environ.get("ASSIGNEES_JSON", ""), [])

known = sorted({
    a.get("name")
    for a in assignees
    if a.get("name")
} | {
    t.get("assignee")
    for t in list_data
    if t.get("assignee")
})

profiles = []
for name in known:
    pid_file = os.path.expanduser(f"~/.hermes/profiles/{name}/gateway.pid") if name != "default" else os.path.expanduser("~/.hermes/gateway.pid")
    online = False
    pid = None
    last_seen = None
    reason = "ok"
    if os.path.isfile(pid_file):
        try:
            with open(pid_file) as f:
                meta = json.load(f)
            pid = meta.get("pid")
            last_seen = meta.get("start_time")
            if pid and subprocess.run(
                ["kill", "-0", str(pid)],
                capture_output=True,
            ).returncode == 0:
                online = True
            else:
                reason = "pid_dead"
        except (OSError, ValueError) as e:
            reason = f"pid_unreadable:{e}"
    else:
        reason = "no_pid_file"
    counts = next(
        (a.get("counts", {}) for a in assignees if a.get("name") == name),
        {},
    )
    profiles.append({
        "name": name,
        "online": online,
        "pid": pid,
        "last_seen": last_seen,
        "reason": reason,
        "counts": counts,
    })

snapshot = {
    "fetched_at": int(time.time()),
    "tasks": list_data,
    "profiles": profiles,
    "version": os.environ.get("VERSION_TAG", ""),
}

with open(out_path, "w") as f:
    json.dump(snapshot, f, ensure_ascii=False, indent=2)
PY
mv "$TMP_MAIN" "$OUT_PATH"

# 每個 task 的完整詳情（包含 events）寫到 tasks/<id>.json，平行抓取。
for tid in $(python3 -c "
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    for t in d.get('tasks', []):
        print(t.get('id', ''))
except Exception:
    pass
" "$OUT_PATH" | grep -v '^$'); do
    TMP_TASK="$(mktemp "${TASKS_DIR}/.${tid}.XXXXXX")"
    hermes kanban show "$tid" --json 2>/dev/null > "$TMP_TASK" &
    echo "$tid:$TMP_TASK"
done | while IFS=: read -r tid tmp; do
    mv "$tmp" "${TASKS_DIR}/${tid}.json" 2>/dev/null
done
wait 2>/dev/null
