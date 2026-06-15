// tests/filter.test.mjs
// Filter & Sort 模組測試。
//
// <!-- v1.0.0 | 2026-06-15 -->

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { applyFilter, KNOWN_SORTS } from '../app/filter.mjs';

const sample = [
  { id: 'a', status: 'ready',   assignee: 'worker1', title: 'Alpha',  created_at: 1000 },
  { id: 'b', status: 'running', assignee: 'worker1', title: 'Bravo',  created_at: 3000 },
  { id: 'c', status: 'ready',   assignee: 'worker2', title: 'Charlie', created_at: 2000 },
  { id: 'd', status: 'done',    assignee: 'worker2', title: 'Delta',  created_at: 4000 },
  { id: 'e', status: 'blocked', assignee: 'default', title: 'Echo',   created_at: 500 },
];

describe('applyFilter', () => {
  test('無 filter 時回傳原陣列（不變順序）', () => {
    const out = applyFilter(sample, {});
    assert.deepEqual(out.map((t) => t.id), ['a', 'b', 'c', 'd', 'e']);
  });

  test('status 篩選：只回指定 status', () => {
    const out = applyFilter(sample, { status: 'ready' });
    assert.deepEqual(out.map((t) => t.id).sort(), ['a', 'c']);
  });

  test('status="all" 視為不限', () => {
    const out = applyFilter(sample, { status: 'all' });
    assert.equal(out.length, sample.length);
  });

  test('assignee 篩選', () => {
    const out = applyFilter(sample, { assignee: 'worker1' });
    assert.deepEqual(out.map((t) => t.id).sort(), ['a', 'b']);
  });

  test('assignee="all" 視為不限', () => {
    const out = applyFilter(sample, { assignee: 'all' });
    assert.equal(out.length, sample.length);
  });

  test('status + assignee 組合', () => {
    const out = applyFilter(sample, { status: 'ready', assignee: 'worker1' });
    assert.deepEqual(out.map((t) => t.id), ['a']);
  });

  test('sort=created_desc：新的在前', () => {
    const out = applyFilter(sample, { sort: 'created_desc' });
    assert.deepEqual(out.map((t) => t.id), ['d', 'b', 'c', 'a', 'e']);
  });

  test('sort=created_asc：舊的在前', () => {
    const out = applyFilter(sample, { sort: 'created_asc' });
    assert.deepEqual(out.map((t) => t.id), ['e', 'a', 'c', 'b', 'd']);
  });

  test('sort=title_asc：依標題字母排序', () => {
    const out = applyFilter(sample, { sort: 'title_asc' });
    assert.deepEqual(out.map((t) => t.title), ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo']);
  });

  test('未知 sort 值：忽略排序，保留原順序', () => {
    const out = applyFilter(sample, { sort: 'whatever' });
    assert.deepEqual(out.map((t) => t.id), ['a', 'b', 'c', 'd', 'e']);
  });

  test('未知 status：防呆不報錯，回傳空陣列', () => {
    // 架構 §4.2 定義「對未知 status 防呆（忽略）」= 不崩潰、不丟例外；
    // 語意等同「filter 到零結果」，由呼叫端決定是否要 fallback。
    assert.doesNotThrow(() => applyFilter(sample, { status: 'totally_made_up' }));
    assert.deepEqual(applyFilter(sample, { status: 'totally_made_up' }), []);
  });

  test('組合：filter + sort', () => {
    const out = applyFilter(sample, {
      status: 'ready',
      sort: 'created_asc',
    });
    // ready: a (1000), c (2000) → a, c
    assert.deepEqual(out.map((t) => t.id), ['a', 'c']);
  });

  test('空陣列輸入：回傳空陣列', () => {
    assert.deepEqual(applyFilter([], { status: 'ready' }), []);
  });

  test('非陣列輸入：拋 TypeError', () => {
    assert.throws(() => applyFilter(null, {}), TypeError);
    assert.throws(() => applyFilter(undefined, {}), TypeError);
    assert.throws(() => applyFilter('not-an-array', {}), TypeError);
  });

  test('不會修改原陣列（pure function）', () => {
    const original = [...sample];
    applyFilter(sample, { status: 'ready', sort: 'title_asc' });
    assert.deepEqual(sample, original);
  });

  test('KNOWN_SORTS 是固定清單（含預期三種）', () => {
    assert.deepEqual(KNOWN_SORTS, ['created_desc', 'created_asc', 'title_asc']);
  });
});
