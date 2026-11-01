const DB_NAME = 'chessflow-live';
const STORE_NAME = 'saved-games';
const FALLBACK_KEY = 'chessflow-live.cloud-saves.v1';
let dbPromise;

function openDb(indexedDb = globalThis.indexedDB) {
  if (!indexedDb) return Promise.reject(new Error('IndexedDB is unavailable.'));
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const request = indexedDb.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => { dbPromise = undefined; throw error; });
  return dbPromise;
}

function fallbackRead(storage = globalThis.localStorage) {
  try { return JSON.parse(storage?.getItem(FALLBACK_KEY) || '[]'); } catch { return []; }
}
function fallbackWrite(rows, storage = globalThis.localStorage) {
  if (!storage) throw new Error('Local storage is unavailable.');
  storage.setItem(FALLBACK_KEY, JSON.stringify(rows));
}

export async function listLocalSaves({ indexedDb, storage } = {}) {
  try {
    const db = await openDb(indexedDb);
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result.sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
      request.onerror = () => reject(request.error);
    });
  } catch { return fallbackRead(storage); }
}

export async function saveLocalGame(game, { indexedDb, storage, now = new Date() } = {}) {
  const row = { id: crypto.randomUUID(), ...game, updated_at: now.toISOString() };
  try {
    const db = await openDb(indexedDb);
    await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(row);
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
    });
  } catch {
    const rows = fallbackRead(storage);
    fallbackWrite([row, ...rows], storage);
  }
  return row;
}

export function closeLocalSaveDb() { dbPromise?.then((db) => db.close()).catch(() => {}); dbPromise = undefined; }
