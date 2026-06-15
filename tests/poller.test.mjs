// tests/poller.test.mjs
// Poller 模組測試 — 驗證 start/stop/pause/resume/trigger/setInterval/on API 行為。
//
// <!-- v1.0.0 | 2026-06-15 -->

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createPoller } from '../app/poller.mjs';

const tick = (ms) => new Promise((r) => setTimeout(r, ms));

describe('createPoller', () => {
  test('啟動後立即觸發第一次 fetcher', async () => {
    let calls = 0;
    const fetcher = async () => { calls++; return { n: calls }; };
    const p = createPoller({ fetcher, interval: 1000 });
    const events = [];
    p.on('data', (d) => events.push(d));
    p.start();
    await tick(10);
    p.stop();
    assert.equal(calls, 1, '啟動後 fetcher 應被呼叫一次');
    assert.equal(events.length, 1, 'data 事件應 emit 一次');
    assert.deepEqual(events[0], { n: 1 });
  });

  test('停止後不再呼叫 fetcher', async () => {
    let calls = 0;
    const fetcher = async () => { calls++; return calls; };
    const p = createPoller({ fetcher, interval: 20 });
    p.start();
    await tick(55);
    const before = calls;
    assert.ok(before >= 2, `啟動 55ms 內 fetcher 至少跑 2 次 (actual ${before})`);
    p.stop();
    await tick(80);
    assert.equal(calls, before, '停止後 fetcher 不應再被呼叫');
  });

  test('pause/resume：pause 期間不輪詢', async () => {
    let calls = 0;
    const fetcher = async () => ++calls;
    const p = createPoller({ fetcher, interval: 20 });
    p.start();
    await tick(25);
    p.pause();
    const pausedAt = calls;
    await tick(80);
    assert.equal(calls, pausedAt, 'pause 期間不應再呼叫 fetcher');
    p.resume();
    await tick(30);
    assert.ok(calls > pausedAt, 'resume 後應繼續輪詢');
    p.stop();
  });

  test('trigger() 立即呼叫 fetcher，不需等 interval', async () => {
    let calls = 0;
    const fetcher = async () => ++calls;
    const p = createPoller({ fetcher, interval: 10000 });
    p.start();
    await tick(10);
    const baseline = calls;
    await p.trigger();
    assert.equal(calls, baseline + 1, 'trigger 應立即呼叫 fetcher 一次');
    p.stop();
  });

  test('setInterval() 動態改變輪詢週期', async () => {
    let calls = 0;
    const fetcher = async () => ++calls;
    const p = createPoller({ fetcher, interval: 1000 });
    p.start();
    await tick(20);
    p.setInterval(20);
    await tick(80);
    const fast = calls;
    assert.ok(fast >= 3, `改 interval=20ms 後 80ms 內至少 3 次 (actual ${fast})`);
    p.setInterval(10000);
    await tick(60);
    const slowedAt = calls;
    await tick(60);
    assert.equal(calls, slowedAt, '改 interval=10s 後短期內不應再呼叫');
    p.stop();
  });

  test('fetcher 拋錯時呼叫 onError 並繼續輪詢', async () => {
    let calls = 0;
    const errors = [];
    const fetcher = async () => {
      calls++;
      if (calls === 1) throw new Error('boom');
      return { ok: true, n: calls };
    };
    const p = createPoller({
      fetcher,
      interval: 20,
      onError: (e) => errors.push(e),
    });
    p.start();
    await tick(60);
    p.stop();
    assert.equal(errors.length, 1, '失敗一次應觸發 onError 一次');
    assert.equal(errors[0].message, 'boom');
    assert.ok(calls >= 2, '失敗後應繼續輪詢');
  });

  test('on(event, fn) 支援 data 與 error 兩種事件', async () => {
    const fetcher = async () => { throw new Error('x'); };
    const p = createPoller({ fetcher, interval: 20 });
    const errs = [];
    p.on('error', (e) => errs.push(e));
    p.start();
    await tick(40);
    p.stop();
    assert.ok(errs.length >= 1, 'on("error", fn) 應收到錯誤');
  });

  test('start() 在已啟動時是冪等 (no double-fire)', async () => {
    let calls = 0;
    const fetcher = async () => ++calls;
    const p = createPoller({ fetcher, interval: 50 });
    p.start();
    p.start();
    p.start();
    await tick(15);
    p.stop();
    assert.equal(calls, 1, '重複 start 不應導致 fetcher 被呼叫多次');
  });

  test('in-flight 重疊防護：慢 fetcher 期間不會再啟動下一次', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    let calls = 0;
    const fetcher = async () => {
      calls++;
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await tick(120);
      inFlight--;
      return calls;
    };
    const p = createPoller({ fetcher, interval: 20 });
    p.start();
    await tick(200);
    p.stop();
    assert.equal(maxInFlight, 1, 'in-flight 不應重疊 (maxInFlight 應為 1)');
  });
});
