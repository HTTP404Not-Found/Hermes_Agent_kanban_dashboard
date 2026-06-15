// app/diff.mjs
// Diff 引擎：比對前後兩個 snapshot，輸出 added / removed / changed 事件流。
//
// 輸入：prev/next 為 { tasks: Map<id, Task>, profiles?: Map<name, Profile> }
// 輸出：events: [
//   { type: 'added',    id, task },
//   { type: 'removed',  id, task },
//   { type: 'changed',  id, prev, next, changes: [fieldName, ...] },
// ]
//
// 「changed」會列出所有值不同的欄位（status, assignee, title, ...）。
// 比較用 strict equality（淺比對），欄位值是 primitive 時夠用。
//
// 架構見 /tmp/kanban-dashboard/architecture.md §2.1。
//
// <!-- v1.0.0 | 2026-06-15 -->

const TRACKED_FIELDS = ['status', 'assignee', 'title', 'priority', 'tenant'];

/**
 * @param {Map|null}  prev  - 前一次 snapshot（id -> 任務）
 * @param {Map|null}  next  - 本次 snapshot（id -> 任務）
 * @returns {Array}   events - added/removed/changed 事件流（順序：removed → changed → added）
 */
export function diff(prev, next) {
  const events = [];
  const prevMap = prev instanceof Map ? prev : new Map();
  const nextMap = next instanceof Map ? next : new Map();

  // removed：prev 有，next 沒有
  for (const [id, task] of prevMap) {
    if (!nextMap.has(id)) {
      events.push({ type: 'removed', id, task });
    }
  }

  // changed：兩邊都有，欄位值不同
  for (const [id, nextTask] of nextMap) {
    if (!prevMap.has(id)) continue;
    const prevTask = prevMap.get(id);
    const changes = [];
    for (const f of TRACKED_FIELDS) {
      if (prevTask[f] !== nextTask[f]) {
        changes.push(f);
      }
    }
    if (changes.length > 0) {
      events.push({ type: 'changed', id, prev: prevTask, next: nextTask, changes });
    }
  }

  // added：prev 沒有，next 有
  for (const [id, task] of nextMap) {
    if (!prevMap.has(id)) {
      events.push({ type: 'added', id, task });
    }
  }

  return events;
}
