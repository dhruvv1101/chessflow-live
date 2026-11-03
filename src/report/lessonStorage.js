import { FREE_LIMITS } from './config.js';

const DB_NAME = 'chessflow-report-lessons';
const STORE = 'lessons';

function openLessonsDb() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('IndexedDB is not available in this browser.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Could not open local lessons storage.'));
  });
}

function lessonId() { return globalThis.crypto?.randomUUID?.() || `lesson-${Date.now()}-${Math.random().toString(36).slice(2)}`; }

export async function loadLessons() {
  const db = await openLessonsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly'); const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.updatedAt - a.updatedAt));
    req.onerror = () => reject(new Error('Could not load lessons.'));
    tx.oncomplete = () => db.close(); tx.onerror = () => { db.close(); reject(new Error('Could not load lessons.')); };
  });
}

export async function saveLesson(input, { maxLessons = FREE_LIMITS.maxSavedLessons, now = Date.now() } = {}) {
  const db = await openLessonsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite'); const store = tx.objectStore(STORE); const read = store.getAll(); let saved;
    read.onsuccess = () => {
      const items = read.result;
      if (items.length >= maxLessons) { tx.abort(); reject(new Error(`You reached the ${maxLessons}-lesson limit. Export lessons before deleting any.`)); return; }
      saved = { ...input, id: input.id || lessonId(), createdAt: now, updatedAt: now, status: input.status === 'mastered' ? 'mastered' : 'active', source: input.source === 'suggested' ? 'suggested' : 'saved by me', correctHandlings: 0, handlingKeys: [], sourceGameIds: Array.isArray(input.sourceGameIds) ? input.sourceGameIds : [] };
      store.add(saved);
    };
    read.onerror = () => { db.close(); reject(new Error('Could not save this lesson.')); };
    tx.oncomplete = () => { db.close(); resolve(saved); };
    tx.onerror = () => { db.close(); if (tx.error?.name !== 'AbortError') reject(new Error('Could not save this lesson.')); };
    tx.onabort = () => { db.close(); if (tx.error?.name !== 'AbortError') reject(new Error('Could not save this lesson.')); };
  });
}

export async function updateLesson(id, changes, { now = Date.now() } = {}) {
  const db = await openLessonsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite'); const store = tx.objectStore(STORE); const req = store.get(id); let result;
    req.onsuccess = () => { if (!req.result) { tx.abort(); return; } result = { ...req.result, ...changes, id, updatedAt: now }; store.put(result); };
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(new Error('Could not update this lesson.')); };
    tx.onabort = () => { db.close(); reject(new Error('Could not update this lesson.')); };
  });
}

export async function deleteLesson(id) {
  const db = await openLessonsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(new Error('Could not delete this lesson.')); };
  });
}

export async function deleteAllLessons() {
  const db = await openLessonsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).clear();
    tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(new Error('Could not delete lessons.')); }
  });
}

export async function recordLessonHandling(id, handlingKey, { threshold = FREE_LIMITS.correctHandlingsToMaster } = {}) {
  const db = await openLessonsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite'); const store = tx.objectStore(STORE); const req = store.get(id); let result;
    req.onsuccess = () => {
      if (!req.result) { tx.abort(); return; }
      const keys = req.result.handlingKeys || [];
      if (!keys.includes(handlingKey)) keys.push(handlingKey);
      result = { ...req.result, handlingKeys: keys, correctHandlings: keys.length, status: keys.length >= threshold ? 'mastered' : req.result.status, updatedAt: Date.now() };
      store.put(result);
    };
    tx.oncomplete = () => { db.close(); resolve(result); }; tx.onerror = () => { db.close(); reject(new Error('Could not update lesson progress.')); };
  });
}

export async function importLessons(lessons, { maxLessons = FREE_LIMITS.maxSavedLessons, now = Date.now() } = {}) {
  if (!Array.isArray(lessons) || lessons.length > maxLessons) throw new Error(`This file exceeds the ${maxLessons}-lesson limit.`);
  const db = await openLessonsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite'); const store = tx.objectStore(STORE); const read = store.getAll(); let imported = [];
    read.onsuccess = () => {
      if (read.result.length + lessons.length > maxLessons) { tx.abort(); reject(new Error(`Only ${Math.max(0, maxLessons - read.result.length)} more lessons fit in this browser. Export or delete lessons first.`)); return; }
      imported = lessons.map((lesson) => ({ ...lesson, id: lessonId(), createdAt: now, updatedAt: now, source: 'saved by me', sourceGameIds: lesson.sourceGameIds || [] }));
      imported.forEach((lesson) => store.add(lesson));
    };
    tx.oncomplete = () => { db.close(); resolve(imported); }; tx.onerror = () => { db.close(); if (tx.error?.name !== 'AbortError') reject(new Error('Could not import lessons.')); };
    tx.onabort = () => { db.close(); if (tx.error?.name !== 'AbortError') reject(new Error('Could not import lessons.')); };
  });
}
