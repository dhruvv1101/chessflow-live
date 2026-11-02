import { FREE_LIMITS } from './config.js';

const DATABASE_NAME = 'chessflow-game-report';
const DATABASE_VERSION = 1;
const GAME_STORE = 'games';

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('IndexedDB is not available in this browser.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(GAME_STORE)) request.result.createObjectStore(GAME_STORE, { keyPath: 'url' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Could not open local report storage.'));
  });
}

export async function loadReportGames() {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(GAME_STORE, 'readonly');
    const request = transaction.objectStore(GAME_STORE).getAll();
    request.onsuccess = () => resolve(request.result.sort((a, b) => b.endTime - a.endTime));
    request.onerror = () => reject(new Error('Could not load locally imported games.'));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => { database.close(); reject(new Error('Could not load locally imported games.')); };
  });
}

export async function saveReportGames(games, { maxGames = FREE_LIMITS.maxGames, now = Date.now() } = {}) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(GAME_STORE, 'readwrite');
    const store = transaction.objectStore(GAME_STORE);
    const read = store.getAll();
    let result = [];
    read.onsuccess = () => {
      const byUrl = new Map(read.result.map((game) => [game.url, game]));
      for (const game of games) byUrl.set(game.url, { ...game, importedAt: now });
      result = [...byUrl.values()]
        .sort((a, b) => b.endTime - a.endTime)
        .slice(0, maxGames);
      store.clear();
      for (const game of result) store.put(game);
    };
    read.onerror = () => { database.close(); reject(new Error('Could not update local report storage.')); };
    transaction.oncomplete = () => { database.close(); resolve(result); };
    transaction.onerror = () => { database.close(); reject(new Error('Could not update local report storage.')); };
    transaction.onabort = () => { database.close(); reject(new Error('Could not update local report storage.')); };
  });
}

export async function clearReportGames() {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(GAME_STORE, 'readwrite');
    transaction.objectStore(GAME_STORE).clear();
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(new Error('Could not delete imported report data.')); };
  });
}
