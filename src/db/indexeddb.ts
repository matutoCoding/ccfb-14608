// 轻量 IndexedDB 封装:器型 / 编法 / 篾料 / 竹种 / 方案 五个对象仓
const DB_NAME = 'bamboo-weave-studio';
const DB_VERSION = 1;

const STORES = ['profiles', 'patterns', 'materials', 'species', 'designs'] as const;
export type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function idbPut<T extends { id: string }>(store: StoreName, value: T): Promise<T> {
  await tx(store, 'readwrite', (s) => s.put(value));
  return value;
}

export async function idbGet<T>(store: StoreName, id: string): Promise<T | undefined> {
  return tx<T | undefined>(store, 'readonly', (s) => s.get(id) as IDBRequest<T | undefined>);
}

export async function idbAll<T>(store: StoreName): Promise<T[]> {
  return tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);
}

export async function idbDelete(store: StoreName, id: string): Promise<void> {
  await tx(store, 'readwrite', (s) => s.delete(id));
}

export async function idbBulkPut<T extends { id: string }>(store: StoreName, values: T[]): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    const s = t.objectStore(store);
    for (const v of values) s.put(v);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
