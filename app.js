// v1.0.0 | 2026-06-15
// app.js — Kanban Dashboard 主整合層
//
// 流程：Poller（fetch snapshot.json）→ Diff（比對前/後 snapshot）→
//       Filter（套用 UI 篩選）→ DOM renderer（mount/update/remove card）
//
// 特色：
//   - mountCard / updateCard / removeCard / pulseBadge
//   - status 變化 200ms pulse cooldown
//   - degraded mode（連續 3 次失敗 → 30s interval）
//   - profile offline → online just-up 動畫
//   - modal 開啟時 fetch tasks/<id>.json 顯示最後 heartbeat
//   - 鍵盤快捷鍵 p (pause) / r (refresh) / Esc (close modal)
//
// <!-- v1.0.0 | 2026-06-15 -->

import { createPoller } from './app/poller.mjs';
import { diff as diffTasks } from './app/diff.mjs';
import { applyFilter } from './app/filter.mjs';

// ---------- 常數 ----------
const NORMAL_INTERVAL_MS = 5000;
const DEGRADED_INTERVAL_MS = 30000;
const DEGRADED_THRESHOLD = 3;
const PULSE_COOLDOWN_MS = 200;
const MODAL_RETRY_COUNT = 3;

// ---------- 工具函式 ----------
function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function fmtTimeAgo(unixSec) {
  if (!unixSec || typeof unixSec !== 'number') return '—';
  const diff = Math.floor(Date.now() / 1000) - unixSec;
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmtDateTime(unixSec) {
  if (!unixSec || typeof unixSec !== 'number') return '—';
  return new Date(unixSec * 1000).toLocaleString('zh-Hant', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

function lastHeartbeatFromTask(taskJson) {
  // 從 taskJson.events 抓最後一次 heartbeat 時間
  const events = Array.isArray(taskJson?.events) ? taskJson.events : [];
  const heartbeat = events.filter(e => e && e.kind === 'heartbeat');
  if (heartbeat.length === 0) return null;
  // events 應該已經是時序排序（fetch 出來是時序倒序的話反轉一下）
  heartbeat.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
  return heartbeat[heartbeat.length - 1].created_at || null;
}

// ---------- Store ----------
const store = {
  tasks: new Map(),      // id -> Task
  profiles: new Map(),   // name -> Profile
  prevTasks: new Map(),  // 上一輪的 tasks map（給 diff 用）
  prevProfiles: new Map(),
  meta: {
    lastFetch: null,
    lastError: null,
    isPaused: false,
    isDegraded: false,
    consecutiveFailures: 0,
    filter: { status: 'all', assignee: 'all', sort: 'created_desc' },
    _lastPulseAt: new Map(), // taskId -> timestamp（cooldown 用）
  },
};

// ---------- DOM refs ----------
const els = {
  btnPause: $('#btn-pause'),
  btnPauseLabel: $('#btn-pause-label'),
  btnRefresh: $('#btn-refresh'),
  lastUpdate: $('#last-update'),
  pollStatus: $('#poll-status'),
  filterStatus: $('#filter-status'),
  filterAssignee: $('#filter-assignee'),
  filterSort: $('#filter-sort'),
  profileStrip: $('#profile-strip'),
  taskGrid: $('#task-grid'),
  emptyState: $('#empty-state'),
  errorBanner: $('#error-banner'),
  errorText: $('#error-text'),
  modal: $('#task-modal'),
  modalTitle: $('#modal-title'),
  modalBody: $('#modal-body'),
  modalClose: $('#modal-close'),
  tplCardSkeleton: $('#tpl-card-skeleton'),
};

// ---------- Fetcher：抓 /snapshot.json ----------
async function fetchSnapshot() {
  // 加 ?t= cache buster，避免瀏覽器拿舊的
  const url = `./snapshot.json?t=${Date.now()}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching snapshot.json`);
  }
  return res.json();
}

// ---------- Fetcher：抓 /tasks/<id>.json（modal 用） ----------
async function fetchTaskDetail(id) {
  const url = `./tasks/${encodeURIComponent(id)}.json?t=${Date.now()}`;
  let lastErr;
  for (let i = 0; i < MODAL_RETRY_COUNT; i += 1) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
      await new Promise(r => setTimeout(r, 200 * (i + 1)));
    }
  }
  throw lastErr;
}

// ---------- Renderer：Profile cards ----------
function renderProfileStrip() {
  const profiles = Array.from(store.profiles.values())
    .sort((a, b) => a.name.localeCompare(b.name));
  if (profiles.length === 0) {
    els.profileStrip.innerHTML = '';
    return;
  }
  // 用 key-based diff：先比對 innerHTML，若有差異才改 DOM
  // 簡化版：直接 innerHTML 重建（profile 數量少，效能可接受）
  els.profileStrip.innerHTML = profiles.map(p => {
    const status = p.online ? 'online' : 'offline';
    const statusText = p.online ? 'ONLINE' : 'OFFLINE';
    const counts = p.counts || {};
    const countsHtml = Object.keys(counts).length
      ? Object.entries(counts)
          .map(([k, v]) => `<span class="profile-card__count">${escapeHtml(k)}: <strong>${v}</strong></span>`)
          .join('')
      : '<span class="profile-card__count">no tasks</span>';
    return `
      <article class="profile-card" data-profile="${escapeHtml(p.name)}">
        <div class="profile-card__header">
          <span class="profile-card__dot profile-card__dot--${status}" aria-hidden="true"></span>
          <span>${escapeHtml(p.name)}</span>
        </div>
        <div class="profile-card__status">${statusText}</div>
        <div class="profile-card__counts">${countsHtml}</div>
        <div class="profile-card__reason">${escapeHtml(p.reason || 'ok')}${p.pid ? ` · pid ${p.pid}` : ''}</div>
      </article>`;
  }).join('');
}

function applyJustUpAnimation(profileName) {
  const card = els.profileStrip.querySelector(`[data-profile="${CSS.escape(profileName)}"]`);
  if (!card) return;
  card.classList.remove('profile--just-up');
  // 強制 reflow 才能重新觸發動畫
  void card.offsetWidth;
  card.classList.add('profile--just-up');
}

// ---------- Renderer：Task cards ----------
function renderTaskGrid() {
  // 套用 filter
  const filterOpts = store.meta.filter;
  const filtered = applyFilter(Array.from(store.tasks.values()), filterOpts);

  // 空狀態
  if (filtered.length === 0) {
    els.taskGrid.innerHTML = '';
    els.emptyState.hidden = false;
    return;
  }
  els.emptyState.hidden = true;

  // 重建 grid（diff 渲染對 50 張以下卡片 ROI 不高，直接重繪）
  // 為了觸發進場動畫，給新進場的卡片加 .card--enter
  const existingIds = new Set($$('.card', els.taskGrid).map(el => el.dataset.taskId));
  const newIds = new Set(filtered.map(t => t.id));

  els.taskGrid.innerHTML = filtered.map(t => {
    const isNew = !existingIds.has(t.id);
    const cls = isNew ? 'card card--enter' : 'card';
    const assigneeText = t.assignee || '—';
    const age = fmtTimeAgo(t.created_at);
    return `
      <article class="${cls}" data-task-id="${escapeHtml(t.id)}" tabindex="0" role="button" aria-label="Task ${escapeHtml(t.title || t.id)}">
        <header class="card__header">
          <span class="card__id">${escapeHtml(t.id)}</span>
          <span class="badge badge--${escapeHtml(t.status || 'ready')}">${escapeHtml(t.status || 'ready')}</span>
        </header>
        <h3 class="card__title">${escapeHtml(t.title || '(no title)')}</h3>
        <div class="card__meta">
          <span class="card__assignee">👤 ${escapeHtml(assigneeText)}</span>
          <span class="card__age">${age}</span>
        </div>
      </article>`;
  }).join('');

  // 綁定 click / keyboard
  $$('.card', els.taskGrid).forEach(card => {
    card.addEventListener('click', () => openModal(card.dataset.taskId));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openModal(card.dataset.taskId);
      }
    });
  });
}

// 補：給 updateCard（in-place status 變化時用）— 但目前策略是 5s 整批重繪，所以 pulseBadge 仍有用
function pulseBadge(taskId) {
  // 200ms cooldown
  const now = Date.now();
  const last = store.meta._lastPulseAt.get(taskId) || 0;
  if (now - last < PULSE_COOLDOWN_MS) return;
  store.meta._lastPulseAt.set(taskId, now);

  const card = els.taskGrid.querySelector(`[data-task-id="${CSS.escape(taskId)}"]`);
  if (!card) return;
  const badge = card.querySelector('.badge');
  if (!badge) return;
  badge.classList.remove('badge--pulse');
  void badge.offsetWidth; // 強制 reflow
  badge.classList.add('badge--pulse');
}

// ---------- Diff 套用：把新 snapshot 進 store + 觸發動畫 ----------
function applySnapshot(snapshot) {
  // 1) 把 prev 存起來
  store.prevTasks = new Map(store.tasks);
  store.prevProfiles = new Map(store.profiles);

  // 2) 進新資料
  const newTasks = new Map();
  if (Array.isArray(snapshot.tasks)) {
    for (const t of snapshot.tasks) {
      if (t && t.id) newTasks.set(t.id, t);
    }
  }
  const newProfiles = new Map();
  if (Array.isArray(snapshot.profiles)) {
    for (const p of snapshot.profiles) {
      if (p && p.name) newProfiles.set(p.name, p);
    }
  }
  store.tasks = newTasks;
  store.profiles = newProfiles;

  // 3) 跑 diff，觸發動畫
  const taskEvents = diffTasks(store.prevTasks, newTasks);
  for (const ev of taskEvents) {
    if (ev.type === 'changed' && ev.changes && ev.changes.includes('status')) {
      pulseBadge(ev.id);
    }
  }

  // 4) profile diff：偵測 just-up
  for (const [name, nextP] of newProfiles) {
    const prevP = store.prevProfiles.get(name);
    if (prevP && prevP.online === false && nextP.online === true) {
      applyJustUpAnimation(name);
    }
  }

  // 5) 重繪 DOM
  renderProfileStrip();
  renderTaskGrid();
  populateAssigneeFilter();
  updateMeta(snapshot);
}

function updateMeta(snapshot) {
  store.meta.lastFetch = snapshot?.fetched_at || Math.floor(Date.now() / 1000);
  els.lastUpdate.textContent = fmtDateTime(store.meta.lastFetch);
}

function populateAssigneeFilter() {
  const current = els.filterAssignee.value;
  const names = Array.from(store.profiles.keys()).sort();
  // 保留第一個 "All"
  els.filterAssignee.innerHTML = '<option value="all">All</option>'
    + names.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
  // 還原使用者選擇（如果還在）
  if (names.includes(current)) {
    els.filterAssignee.value = current;
  }
}

// ---------- Error / banner ----------
function showError(message, degraded = false) {
  els.errorBanner.hidden = false;
  els.errorText.textContent = message;
  els.errorBanner.classList.toggle('error-banner--degraded', degraded);
}
function hideError() {
  els.errorBanner.hidden = true;
}

// ---------- Pause / Resume / Refresh UI ----------
function setPausedUI(paused) {
  store.meta.isPaused = paused;
  els.btnPauseLabel.textContent = paused ? 'Resume' : 'Pause';
  els.btnPause.classList.toggle('btn--paused', paused);
  els.pollStatus.textContent = paused ? 'Paused' : (store.meta.isDegraded ? 'Degraded mode (30s)' : 'Polling…');
}
function setDegradedUI(degraded) {
  store.meta.isDegraded = degraded;
  els.pollStatus.textContent = degraded ? 'Degraded mode (30s)' : 'Polling…';
}

// ---------- Modal ----------
async function openModal(taskId) {
  const task = store.tasks.get(taskId);
  if (!task) return;
  // 標題先用 list snapshot 資料
  els.modalTitle.textContent = task.title || task.id;
  els.modalBody.innerHTML = '<p class="modal__value">Loading detail…</p>';
  try {
    if (typeof els.modal.showModal === 'function') {
      els.modal.showModal();
    } else {
      els.modal.setAttribute('open', '');
    }
  } catch (_) { /* dialog may already be open */ }

  try {
    const detail = await fetchTaskDetail(taskId);
    const lastHb = lastHeartbeatFromTask(detail);
    const events = Array.isArray(detail.events) ? detail.events : [];
    const eventsHtml = events.length
      ? `<ul class="modal__events-list">${events.slice(-20).reverse().map(e => `
          <li class="modal__event">
            <span class="modal__event-kind">${escapeHtml(e.kind || 'event')}</span>
            <span>${escapeHtml(fmtDateTime(e.created_at))}</span>
          </li>
        `).join('')}</ul>`
      : '<p class="modal__value modal__value--mono">No events recorded.</p>';

    els.modalBody.innerHTML = `
      <section class="modal__section">
        <span class="modal__label">ID</span>
        <span class="modal__value modal__value--mono">${escapeHtml(task.id)}</span>
      </section>
      <section class="modal__section">
        <span class="modal__label">Status</span>
        <span class="modal__value"><span class="badge badge--${escapeHtml(task.status || 'ready')}">${escapeHtml(task.status || 'ready')}</span></span>
      </section>
      <section class="modal__section">
        <span class="modal__label">Assignee</span>
        <span class="modal__value">${escapeHtml(task.assignee || '—')}</span>
      </section>
      <section class="modal__section">
        <span class="modal__label">Created at</span>
        <span class="modal__value">${fmtDateTime(task.created_at)}</span>
      </section>
      <section class="modal__section">
        <span class="modal__label">Started at</span>
        <span class="modal__value">${fmtDateTime(task.started_at)}</span>
      </section>
      <section class="modal__section">
        <span class="modal__label">Last heartbeat</span>
        <span class="modal__value modal__value--mono">${lastHb ? fmtDateTime(lastHb) : '— (none)'}</span>
      </section>
      <section class="modal__section">
        <span class="modal__label">Priority</span>
        <span class="modal__value">${task.priority ?? '—'}</span>
      </section>
      <section class="modal__events">
        <span class="modal__label">Recent events (last 20)</span>
        ${eventsHtml}
      </section>
    `;
  } catch (err) {
    els.modalBody.innerHTML = `
      <p class="modal__value" style="color: var(--status-blocked);">
        Failed to load detail: ${escapeHtml(err.message)}
      </p>
      <button class="btn" id="modal-retry">Retry</button>
    `;
    const retry = $('#modal-retry');
    if (retry) retry.addEventListener('click', () => openModal(taskId));
  }
}

function closeModal() {
  if (els.modal.open) {
    els.modal.close();
  } else {
    els.modal.removeAttribute('open');
  }
}

// ---------- HTML escape（避免 XSS） ----------
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------- Wire up Poller ----------
const poller = createPoller({
  fetcher: fetchSnapshot,
  interval: NORMAL_INTERVAL_MS,
  onError: (err) => {
    store.meta.consecutiveFailures += 1;
    store.meta.lastError = err.message;
    if (store.meta.consecutiveFailures >= DEGRADED_THRESHOLD) {
      setDegradedUI(true);
      poller.setInterval(DEGRADED_INTERVAL_MS);
      showError(`Degraded mode: ${err.message}（已連續失敗 ${store.meta.consecutiveFailures} 次，切 30s 輪詢）`, true);
    } else {
      showError(`輪詢失敗 (${store.meta.consecutiveFailures}/${DEGRADED_THRESHOLD}): ${err.message}`);
    }
  },
});

poller.on('data', (snapshot) => {
  // 成功 → 清掉錯誤與 degraded 標記
  store.meta.consecutiveFailures = 0;
  if (store.meta.isDegraded) {
    setDegradedUI(false);
    poller.setInterval(NORMAL_INTERVAL_MS);
  }
  hideError();
  applySnapshot(snapshot);
});

// ---------- Wire up UI controls ----------
els.btnPause.addEventListener('click', () => {
  if (store.meta.isPaused) {
    poller.resume();
    setPausedUI(false);
  } else {
    poller.pause();
    setPausedUI(true);
  }
});

els.btnRefresh.addEventListener('click', () => {
  poller.trigger();
});

els.filterStatus.addEventListener('change', () => {
  store.meta.filter.status = els.filterStatus.value;
  renderTaskGrid();
});
els.filterAssignee.addEventListener('change', () => {
  store.meta.filter.assignee = els.filterAssignee.value;
  renderTaskGrid();
});
els.filterSort.addEventListener('change', () => {
  store.meta.filter.sort = els.filterSort.value;
  renderTaskGrid();
});

els.modalClose.addEventListener('click', closeModal);
els.modal.addEventListener('click', (e) => {
  // 點 backdrop 關閉
  if (e.target === els.modal) closeModal();
});

// 鍵盤快捷鍵
document.addEventListener('keydown', (e) => {
  // 如果焦點在 input/select，跳過
  const tag = (e.target && e.target.tagName) || '';
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;

  if (e.key === 'p' || e.key === 'P') {
    e.preventDefault();
    els.btnPause.click();
  } else if (e.key === 'r' || e.key === 'R') {
    e.preventDefault();
    els.btnRefresh.click();
  } else if (e.key === 'Escape') {
    if (els.modal.open) {
      e.preventDefault();
      closeModal();
    }
  }
});

// ---------- 初次顯示 skeletons ----------
function renderSkeletons() {
  const n = 6;
  const tpl = els.tplCardSkeleton;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < n; i += 1) {
    frag.appendChild(tpl.content.cloneNode(true));
  }
  els.taskGrid.innerHTML = '';
  els.taskGrid.appendChild(frag);
}

// ---------- 啟動 ----------
renderSkeletons();
setPausedUI(false);
els.pollStatus.textContent = 'Polling…';
poller.start();
