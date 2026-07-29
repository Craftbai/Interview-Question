import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushNow, loadState, resetState, saveState, scheduleSave } from './store';

const SAMPLE = JSON.stringify({ version: 2, q: { 'c-1': { box: 2 } } });

describe('store', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetState();
  });

  it('returns null on a fresh install', async () => {
    expect(await loadState()).toBeNull();
  });

  it('round-trips through IndexedDB', async () => {
    await saveState(SAMPLE);
    expect(await loadState()).toBe(SAMPLE);
  });

  it('mirrors every write to localStorage as a snapshot', async () => {
    await saveState(SAMPLE);
    expect(localStorage.getItem('embq.v2')).toBe(SAMPLE);
  });

  it('falls back to the v2 localStorage snapshot when IndexedDB is empty', async () => {
    localStorage.setItem('embq.v2', SAMPLE);
    expect(await loadState()).toBe(SAMPLE);
  });

  it('migrates a v1 localStorage archive when nothing else exists', async () => {
    const v1 = JSON.stringify({
      version: 1,
      q: { 'c-1': { box: 3, right: 2, wrong: 0, seen: 2, last: 111, fav: true } },
      days: { '2026-07-28': 5 },
      wrongToday: {},
      settings: { theme: 'dark', oral: false, oralSeconds: 60 },
    });
    localStorage.setItem('embq.v1', v1);

    const loaded = await loadState();
    expect(loaded).not.toBeNull();
    const parsed = JSON.parse(loaded!);
    expect(parsed.q['c-1'].box).toBe(3);
    expect(parsed.settings.theme).toBe('dark');
    expect(parsed.version).toBe(2);
    // 旧 key 保留一个版本周期，不删
    expect(localStorage.getItem('embq.v1')).toBe(v1);
    // 迁移结果应已写进 IndexedDB
    expect(await loadState()).toBe(loaded);
  });

  it('prefers IndexedDB over the localStorage snapshot', async () => {
    await saveState(SAMPLE);
    localStorage.setItem('embq.v2', JSON.stringify({ version: 2, q: { stale: true } }));
    expect(await loadState()).toBe(SAMPLE);
  });

  it('debounces scheduleSave into a single write', async () => {
    vi.useFakeTimers();
    scheduleSave('{"a":1}');
    scheduleSave('{"a":2}');
    scheduleSave('{"a":3}');
    await vi.advanceTimersByTimeAsync(400);
    vi.useRealTimers();
    expect(await loadState()).toBe('{"a":3}');
  });

  it('flushNow writes the pending value immediately', async () => {
    vi.useFakeTimers();
    scheduleSave(SAMPLE);
    vi.useRealTimers();
    await flushNow();
    expect(await loadState()).toBe(SAMPLE);
  });

  it('survives an unavailable IndexedDB by using localStorage only', async () => {
    const original = globalThis.indexedDB;
    // @ts-expect-error 故意打坏
    globalThis.indexedDB = undefined;
    await saveState(SAMPLE);
    expect(localStorage.getItem('embq.v2')).toBe(SAMPLE);
    expect(await loadState()).toBe(SAMPLE);
    globalThis.indexedDB = original;
  });
});
