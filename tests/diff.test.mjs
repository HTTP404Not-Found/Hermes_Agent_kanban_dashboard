// tests/diff.test.mjs
// Diff 引擎測試 — 驗證 added / removed / changed 三種事件，
// 以及 status 與 assignee 變化的明細。
//
// <!-- v1.0.0 | 2026-06-15 -->

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { diff } from '../app/diff.mjs';

const toMap = (arr) => new Map(arr.map((t) => [t.id, t]));

describe('diff', () => {
  test('無變化時回空陣列', () => {
    const snap = toMap([
      { id: 'a', status: 'ready', title: 'A' },
      { id: 'b', status: 'running', title: 'B' },
    ]);
    const events = diff(snap, snap);
    assert.deepEqual(events, []);
  });

  test('新任務加入：emit added 事件', () => {
    const prev = toMap([{ id: 'a', status: 'ready' }]);
    const next = toMap([
      { id: 'a', status: 'ready' },
      { id: 'b', status: 'ready' },
    ]);
    const events = diff(prev, next);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'added');
    assert.equal(events[0].id, 'b');
    assert.equal(events[0].task.id, 'b');
  });

  test('任務被移除：emit removed 事件', () => {
    const prev = toMap([
      { id: 'a', status: 'ready' },
      { id: 'b', status: 'running' },
    ]);
    const next = toMap([{ id: 'a', status: 'ready' }]);
    const events = diff(prev, next);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'removed');
    assert.equal(events[0].id, 'b');
  });

  test('任務 status 改變：emit changed with status 變化明細', () => {
    const prev = toMap([{ id: 'a', status: 'ready', assignee: 'worker1', title: 'A' }]);
    const next = toMap([{ id: 'a', status: 'running', assignee: 'worker1', title: 'A' }]);
    const events = diff(prev, next);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'changed');
    assert.equal(events[0].id, 'a');
    assert.deepEqual(events[0].changes, ['status']);
    assert.equal(events[0].prev.status, 'ready');
    assert.equal(events[0].next.status, 'running');
  });

  test('多欄位同時變化：changes 列出所有變動的欄位', () => {
    const prev = toMap([{ id: 'a', status: 'ready', assignee: 'worker1', title: 'Old' }]);
    const next = toMap([{ id: 'a', status: 'running', assignee: 'worker2', title: 'New' }]);
    const events = diff(prev, next);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'changed');
    assert.deepEqual(events[0].changes.sort(), ['assignee', 'status', 'title']);
  });

  test('同欄位值相同：即使物件 reference 不同也算無變化', () => {
    const prev = toMap([{ id: 'a', status: 'ready', title: 'A' }]);
    const next = toMap([{ id: 'a', status: 'ready', title: 'A' }]);
    assert.deepEqual(diff(prev, next), []);
  });

  test('混合 added + removed + changed', () => {
    const prev = toMap([
      { id: 'a', status: 'ready' },
      { id: 'b', status: 'running' },
      { id: 'c', status: 'done' },
    ]);
    const next = toMap([
      { id: 'a', status: 'running' },   // changed
      { id: 'b', status: 'running' },   // unchanged
      { id: 'd', status: 'ready' },     // added
      // c removed
    ]);
    const events = diff(prev, next);
    const byType = events.reduce((acc, e) => {
      acc[e.type] = (acc[e.type] || []).concat(e);
      return acc;
    }, {});
    assert.equal(byType.added?.length, 1);
    assert.equal(byType.added[0].id, 'd');
    assert.equal(byType.removed?.length, 1);
    assert.equal(byType.removed[0].id, 'c');
    assert.equal(byType.changed?.length, 1);
    assert.equal(byType.changed[0].id, 'a');
    assert.deepEqual(byType.changed[0].changes, ['status']);
  });

  test('prev 為 null/undefined 時：全部視為 added', () => {
    const next = toMap([{ id: 'a', status: 'ready' }]);
    const events = diff(null, next);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'added');
  });

  test('next 為 null/undefined 時：全部視為 removed', () => {
    const prev = toMap([{ id: 'a', status: 'ready' }]);
    const events = diff(prev, null);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'removed');
  });
});
