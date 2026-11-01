import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { closeLocalSaveDb, listLocalSaves, saveLocalGame } from './savedGames.js';

afterEach(() => { closeLocalSaveDb(); indexedDB.deleteDatabase('chessflow-live'); localStorage.clear(); });

describe('local saved-game adapter', () => {
  it('stores and lists games in IndexedDB', async () => {
    const row = await saveLocalGame({ name: 'Test game', fen: 'fen', pgn: '1. e4' });
    await expect(listLocalSaves()).resolves.toMatchObject([{ id: row.id, name: 'Test game', fen: 'fen', pgn: '1. e4' }]);
  });

  it('falls back to local storage only when IndexedDB is unavailable', async () => {
    const unavailableStorage = { getItem: () => null, setItem: (_key, value) => { unavailableStorage.value = value; } };
    await saveLocalGame({ name: 'Offline', fen: 'fen', pgn: '' }, { indexedDb: null, storage: unavailableStorage });
    expect(JSON.parse(unavailableStorage.value)[0].name).toBe('Offline');
  });
});
