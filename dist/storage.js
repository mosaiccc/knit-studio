const DATABASE = 'knit-studio';
const STORE = 'workspace';
const KEY = 'current';
const FALLBACK_KEY = 'knit-studio-workspace-v1';
const PENDING_KEY = 'knit-studio-workspace-pending-v1';

/** Best-effort synchronous recovery journal for refreshes before the asynchronous save finishes. */
export function stageWorkspace(raw) {
  let storage;
  try {
    storage = globalThis.localStorage;
    if (!storage) return false;
    storage.setItem(PENDING_KEY, JSON.stringify(raw));
    return true;
  } catch {
    // A failed larger snapshot must not leave an older journal that could later override a successful IDB save.
    try { storage?.removeItem(PENDING_KEY); } catch { /* IndexedDB remains the primary store. */ }
    return false;
  }
}

function pendingSnapshot() {
  try { return globalThis.localStorage?.getItem(PENDING_KEY) ?? null; }
  catch { return null; } // An unavailable journal must not prevent access to IndexedDB.
}

function clearMatchingPending(serialized) {
  try {
    const storage = globalThis.localStorage;
    if (storage?.getItem(PENDING_KEY) === serialized) storage.removeItem(PENDING_KEY);
  } catch { /* A completed primary save remains successful if optional journal cleanup is unavailable. */ }
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    let request;
    let settled = false;
    let upgradeError;
    try {
      if (!globalThis.indexedDB) { resolve(null); return; }
      request = globalThis.indexedDB.open(DATABASE, 1);
    } catch (error) {
      if (error?.name === 'QuotaExceededError') reject(error);
      else resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      try {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      } catch (error) { upgradeError = error; request.transaction?.abort(); }
    };
    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      settled = true;
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      const error = upgradeError || request.error;
      if (error?.name === 'QuotaExceededError') reject(error);
      else resolve(null);
    };
    request.onblocked = () => {
      if (settled) return;
      settled = true;
      reject(new Error('工程存储正在被另一个页面占用，请关闭其他织间页面后重试。'));
    };
  });
}

function fallbackStorage() {
  const storage = globalThis.localStorage;
  if (!storage) throw new Error('当前浏览器无法使用本地存储，请下载备份保存作品。');
  return storage;
}

function transact(database, mode, value) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    const request = mode === 'readonly' ? store.get(KEY) : store.put(value, KEY);
    let result = null;
    request.onsuccess = () => { if (mode === 'readonly') result = request.result ?? null; };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = transaction.onabort = () => reject(transaction.error || request.error || new Error('工程存储操作未完成，请重试或下载备份。'));
  });
}

/** Returns an unvalidated saved workspace or null; callers own schema validation and migrations. */
export async function readWorkspace() {
  const pending = pendingSnapshot();
  if (pending !== null) return JSON.parse(pending); // Corrupt JSON remains visible to the caller.
  const database = await openDatabase();
  if (!database) {
    const value = fallbackStorage().getItem(FALLBACK_KEY);
    return value === null ? null : JSON.parse(value);
  }
  try {
    const saved = await transact(database, 'readonly');
    if (saved !== null) return saved;
    // Migrate a workspace saved while IndexedDB was unavailable; the caller's next write persists it here.
    const previous = globalThis.localStorage?.getItem(FALLBACK_KEY);
    return previous == null ? null : JSON.parse(previous);
  }
  finally { database.close(); }
}

/** Takes a detached snapshot immediately, then waits for the atomic write transaction to complete. */
export async function writeWorkspace(raw) {
  const snapshot = structuredClone(raw);
  const serialized = JSON.stringify(snapshot);
  const database = await openDatabase();
  if (!database) {
    fallbackStorage().setItem(FALLBACK_KEY, serialized);
    clearMatchingPending(serialized);
    return;
  }
  try {
    await transact(database, 'readwrite', snapshot);
    clearMatchingPending(serialized);
  }
  finally { database.close(); }
}
