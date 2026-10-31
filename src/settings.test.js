import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings, saveSettings } from './settings.js';

function storageWith(value = null) {
  const values = new Map(value === null ? [] : [[SETTINGS_KEY, value]]);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, next) => values.set(key, next),
    removeItem: (key) => values.delete(key),
  };
}

describe('settings store', () => {
  it('returns defaults when there is no saved value', () => {
    expect(loadSettings(storageWith())).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back safely on corrupt or unsupported data', () => {
    expect(loadSettings(storageWith('{not json')).theme).toBe(DEFAULT_SETTINGS.theme);
    expect(loadSettings(storageWith(JSON.stringify({ version: 99, settings: { theme: 'dark' } })))).toEqual(DEFAULT_SETTINGS);
    const invalid = loadSettings(storageWith(JSON.stringify({ version: 1, settings: { theme: 'sepia', boardColor: 'rainbow', hintTime: 3 } })));
    expect(invalid.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(invalid.boardColor).toBe(DEFAULT_SETTINGS.boardColor);
    expect(invalid.hintTime).toBe(DEFAULT_SETTINGS.hintTime);
  });

  it('migrates version zero data and writes version one', () => {
    const storage = storageWith(JSON.stringify({ version: 0, settings: { theme: 'dark', hintSeconds: 6, defaultDifficulty: 'Hard', flipBoard: true } }));
    expect(loadSettings(storage)).toMatchObject({ theme: 'dark', hintTime: 6000, defaultDifficulty: 'Hard', flipBoard: true });
    expect(JSON.parse(storage.getItem(SETTINGS_KEY)).version).toBe(1);
  });

  it('does not throw when storage is unavailable', () => {
    const unavailable = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    expect(loadSettings(unavailable)).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings({ theme: 'dark' }, unavailable).theme).toBe('dark');
  });
});
