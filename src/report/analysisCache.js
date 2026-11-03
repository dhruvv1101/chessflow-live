import { normalizeAnalysisFen } from './analysis.js';

const DATABASE_NAME = 'chessflow-report-analysis';
const STORE_NAME = 'positions';
let databasePromise;

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('IndexedDB is not available in this browser.'));
  if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
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

export async function clearAnalysisCache() {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('Could not clear the local analysis cache.'));
  });
}

export const reportAnalysisCache = Object.freeze({ get: getCachedAnalysis, put: putCachedAnalysis });
