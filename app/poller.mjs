// app/poller.js
// Poller 模組：依 interval 週期呼叫 fetcher，提供 start/stop/pause/resume/
// trigger/setInterval/on API。錯誤走 onError 與 error 事件，不中斷輪詢。
//
// 架構見 /tmp/kanban-dashboard/architecture.md §2.1。
//
// <!-- v1.0.0 | 2026-06-15 -->

/**
 * 建立一個 Poller 實例。
 *
 * @param {Object}   opts
 * @param {Function} opts.fetcher  - async () => any，實際抓資料的函式
 * @param {number}   opts.interval - 輪詢週期 (ms)
 * @param {Function} [opts.onError] - 失敗處理 callback: (err) => void
 * @returns {Object}  poller 實例
 */
export function createPoller({ fetcher, interval, onError } = {}) {
  if (typeof fetcher !== 'function') {
    throw new TypeError('createPoller: opts.fetcher must be a function');
  }
  if (!Number.isFinite(interval) || interval <= 0) {
    throw new TypeError('createPoller: opts.interval must be a positive number');
  }

  // --- 內部狀態 ---
  let _interval = interval;        // 當前輪詢週期
  let _timer = null;               // setTimeout handle
  let _inFlight = false;           // in-flight 旗標，避免重疊
  let _running = false;            // 已呼叫 start()
  let _paused = false;             // pause 期間
  let _stopped = false;            // 永久停止旗標
  const _listeners = { data: [], error: [] };

  // --- 事件 API ---
  function on(event, fn) {
    if (!_listeners[event]) {
      throw new TypeError(`Poller.on: unknown event "${event}"`);
    }
    if (typeof fn !== 'function') {
      throw new TypeError(`Poller.on: handler for "${event}" must be a function`);
    }
    _listeners[event].push(fn);
  }

  function emit(event, payload) {
    const fns = _listeners[event] || [];
    for (const fn of fns) {
      try {
        fn(payload);
      } catch (e) {
        // listener 拋錯不影響其他 listener
      }
    }
  }

  // --- 核心：執行一次 fetcher ---
  async function _runOnce() {
    if (_stopped || _paused || _inFlight) return;
    _inFlight = true;
    try {
      const data = await fetcher();
      emit('data', data);
    } catch (err) {
      if (typeof onError === 'function') {
        try { onError(err); } catch (_) { /* swallow */ }
      }
      emit('error', err);
    } finally {
      _inFlight = false;
      // 若仍在 running 且未 pause，安排下一次
      if (_running && !_stopped && !_paused) {
        _timer = setTimeout(_runOnce, _interval);
      }
    }
  }

  // --- 公開 API ---
  function start() {
    if (_stopped) return;          // stop 後不能再 start
    if (_running) return;          // 冪等
    _running = true;
    _paused = false;
    // 立即觸發第一次（不需等 interval）
    _runOnce();
  }

  function stop() {
    _stopped = true;
    _running = false;
    _paused = false;
    if (_timer !== null) {
      clearTimeout(_timer);
      _timer = null;
    }
  }

  function pause() {
    if (_stopped) return;
    _paused = true;
    if (_timer !== null) {
      clearTimeout(_timer);
      _timer = null;
    }
  }

  function resume() {
    if (_stopped) return;
    if (!_paused) return;
    _paused = false;
    // 立刻補一次，讓 UI 馬上有資料
    _runOnce();
  }

  function trigger() {
    if (_stopped) return;
    // 不論 pause 與否，trigger 強制補一次
    return _runOnce();
  }

  function setInterval(ms) {
    if (!Number.isFinite(ms) || ms <= 0) {
      throw new TypeError('setInterval: ms must be a positive number');
    }
    _interval = ms;
    // 若 timer 正在排程中且未 in-flight，下次自然會用新週期
    if (_running && !_paused && !_inFlight && _timer !== null) {
      clearTimeout(_timer);
      _timer = setTimeout(_runOnce, _interval);
    }
  }

  return {
    on,
    start,
    stop,
    pause,
    resume,
    trigger,
    setInterval,
  };
}
