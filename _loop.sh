#!/usr/bin/env bash
# 每 5 秒執行一次 fetch_data.sh（cron 替代方案）。
# <!-- v1.0.0 | 2026-06-15 -->
while true; do
  /tmp/kanban-dashboard/fetch_data.sh
  sleep 1
done
