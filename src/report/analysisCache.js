import { normalizeAnalysisFen } from './analysis.js';

const DATABASE_NAME = 'chessflow-report-analysis';
const STORE_NAME = 'positions';
const GAME_STORE_NAME = 'games';
let databasePromise;

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('IndexedDB is not available in this browser.'));
  if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
      if (!request.result.objectStoreNames.contains(GAME_STORE_NAME)) request.result.createObjectStore(GAME_STORE_NAME, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { databasePromise = null; reject(new Error('Could not open the local analysis cache.')); };
  });
  return databasePromise;
}

function cacheKey(fen, depth) {
  return `${normalizeAnalysisFen(fen)}|depth:${Number(depth)}`;
}

export async function getCachedAnalysis(fen, depth) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(cacheKey(fen, depth));
    request.onsuccess = () => resolve(request.result?.analysis ?? null);
    request.onerror = () => reject(new Error('Could not read the local analysis cache.'));
    transaction.onerror = () => reject(new Error('Could not read the local analysis cache.'));
  });
}

export async function putCachedAnalysis(fen, depth, analysis) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put({ key: cacheKey(fen, depth), analysis, cachedAt: Date.now() });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('Could not write the local analysis cache.'));
    transaction.onabort = () => reject(new Error('Could not write the local analysis cache.'));
  });
}

function gameAnalysisKey(gameKey, depth) {
  return `${String(gameKey)}|depth:${Number(depth)}`;
}

export async function getCachedGameAnalysis(gameKey, depth) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(GAME_STORE_NAME, 'readonly');
    const request = transaction.objectStore(GAME_STORE_NAME).get(gameAnalysisKey(gameKey, depth));
    request.onsuccess = () => resolve(request.result?.rows ?? null);
    request.onerror = () => reject(new Error('Could not read the saved game analysis.'));
    transaction.onerror = () => reject(new Error('Could not read the saved game analysis.'));
  });
}

export async function putCachedGameAnalysis(gameKey, depth, rows) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(GAME_STORE_NAME, 'readwrite');
    transaction.objectStore(GAME_STORE_NAME).put({ key: gameAnalysisKey(gameKey, depth), rows, cachedAt: Date.now() });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('Could not save the game analysis.'));
    transaction.onabort = () => reject(new Error('Could not save the game analysis.'));
  });
}

export async function clearAnalysisCache() {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME, GAME_STORE_NAME], 'readwrite');
    transaction.objectStore(STORE_NAME).clear();
    transaction.objectStore(GAME_STORE_NAME).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('Could not clear the local analysis cache.'));
  });
}

export const reportAnalysisCache = Object.freeze({
  get: getCachedAnalysis, put: putCachedAnalysis,
  getGame: getCachedGameAnalysis, putGame: putCachedGameAnalysis,
});
