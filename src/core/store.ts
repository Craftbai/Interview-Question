const DB_NAME = 'embq';
const DB_VERSION = 2;
const STORE = 'state';
const KEY = 'current';
const LS_V2 = 'embq.v2';
const LS_V1 = 'embq.v1';
const DEBOUNCE_MS = 300;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

function idbGet(db: IDBDatabase): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function idbPut(db: IDBDatabase, json: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(json, KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/** v1 存档补齐 v2 新增字段。字段名本身两版一致，只是多了 deck。 */
function upgradeV1(raw: string): string | null {
  try {
    const s = JSON.parse(raw) as Record<string, unknown>;
    if (typeof s !== 'object' || s === null) return null;
    s.version = 2;
    s.q ??= {};
    s.days ??= {};
    s.wrongToday ??= {};
    s.settings ??= { theme: 'auto', oral: false, oralSeconds: 60 };
    s.deck ??= null;
    return JSON.stringify(s);
  } catch {
    return null;
  }
}

/**
 * 读顺序：IndexedDB → localStorage v2 快照 → localStorage v1 旧存档（自动迁移）→ null
 */
export async function loadState(): Promise<string | null> {
  const db = await openDb();
  if (db) {
    const hit = await idbGet(db);
    if (hit) return hit;
  }

  const snapshot = safeGetItem(LS_V2);
  if (snapshot) {
    if (db) await idbPut(db, snapshot);
    return snapshot;
  }

  const legacy = safeGetItem(LS_V1);
  if (legacy) {
    const upgraded = upgradeV1(legacy);
    if (upgraded) {
      // 旧 key 不删，保留一个版本周期作为回退
      if (db) await idbPut(db, upgraded);
      safeSetItem(LS_V2, upgraded);
      return upgraded;
    }
  }

  return null;
}

/** 双写：IndexedDB 为主，localStorage 留一份快照当救命绳 */
export async function saveState(json: string): Promise<void> {
  const db = await openDb();
  if (db) await idbPut(db, json);
  safeSetItem(LS_V2, json);
}

export async function resetState(): Promise<void> {
  const db = await openDb();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
  safeRemoveItem(LS_V2);
}

function safeGetItem(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function safeSetItem(k: string, v: string): void {
  try { localStorage.setItem(k, v); } catch { /* 配额满或被禁用，IndexedDB 还在 */ }
}
function safeRemoveItem(k: string): void {
  try { localStorage.removeItem(k); } catch { /* ignore */ }
}

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: string | null = null;

/** record() 后调用。300ms 内的连续调用合并成一次落盘。 */
export function scheduleSave(json: string): void {
  pending = json;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { void flushNow(); }, DEBOUNCE_MS);
}

/** 立刻落盘待写值。切后台、关页面时调用。 */
export async function flushNow(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null; }
  const json = pending;
  pending = null;
  if (json !== null) await saveState(json);
}

/**
 * 装上「切后台 / 关页面就落盘」的钩子。
 * v1 只有 debounce，切后台时那一档时间窗内的作答会丢 —— 这是进度丢失的第二个来源。
 */
export function installFlushHooks(getJson: () => string): void {
  const flush = () => {
    pending = getJson();
    // pagehide/visibilitychange 里没时间等 Promise，先同步写快照保底
    safeSetItem(LS_V2, pending);
    void flushNow();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
}
