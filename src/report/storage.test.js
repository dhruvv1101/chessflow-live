import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { clearReportGames, loadReportGames, saveReportGames } from './storage.js';

afterEach(async () => { await clearReportGames(); });

describe('report IndexedDB storage', () => {
  it('stores only capped imports and can delete all imported data', async () => {
    const games = Array.from({ length: 28 }, (_, index) => ({ url: `https://chess.com/${index}`, endTime: Date.UTC(2010, 0, 1) - index, pgn: '1. e4 *' }));
    const saved = await saveReportGames(games, { maxGames: 25, now: Date.UTC(2026, 10, 3) });
    expect(saved).toHaveLength(25);
    expect(saved.at(-1).endTime).toBe(Date.UTC(2010, 0, 1) - 24);
    expect(await loadReportGames()).toHaveLength(25);
    await clearReportGames();
    expect(await loadReportGames()).toEqual([]);
  });
});
