// app/filter.mjs
// Filter & Sort 模組：對 task 陣列套用 status / assignee 篩選 + 排序。
//
// 架構見 /tmp/kanban-dashboard/architecture.md §2.1。
//
// <!-- v1.0.0 | 2026-06-15 -->

export const KNOWN_SORTS = ['created_desc', 'created_asc', 'title_asc'];

const NO_FILTER = 'all';
const DEFAULT_SORT = 'created_desc';

const _cmp = {
  created_desc: (a, b) => (b.created_at ?? 0) - (a.created_at ?? 0),
  created_asc:  (a, b) => (a.created_at ?? 0) - (b.created_at ?? 0),
  title_asc:    (a, b) => String(a.title ?? '').localeCompare(String(b.title ?? '')),
};

/**
 * 套用篩選與排序，回傳新陣列（pure function，不修改輸入）。
 *
 * @param {Array}  tasks - 待過濾的 task 陣列
 * @param {Object} opts
 * @param {string} [opts.status]   - 指定 status；'all' 或未知值視為不限
 * @param {string} [opts.assignee] - 指定 assignee；'all' 視為不限
 * @param {string} [opts.sort]     - 排序方式（見 KNOWN_SORTS）；未知值忽略
 * @returns {Array} 過濾並排序後的 task 陣列
 */
export function applyFilter(tasks, opts = {}) {
  if (!Array.isArray(tasks)) {
    throw new TypeError('applyFilter: tasks must be an array');
  }
  if (opts === null || typeof opts !== 'object') {
    throw new TypeError('applyFilter: opts must be an object');
  }

  const { status, assignee, sort } = opts;
  const out = tasks.filter((t) => {
    if (status && status !== NO_FILTER) {
      if (t.status !== status) return false;
    }
    if (assignee && assignee !== NO_FILTER) {
      if (t.assignee !== assignee) return false;
    }
    return true;
  });

  const cmp = _cmp[sort];
  if (cmp) {
    out.sort(cmp);
  }
  return out;
}
