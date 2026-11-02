import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { clearReportGames, loadReportGames, saveReportGames } from './storage.js';

afterEach(async () => { await clearReportGames(); });

describe('report IndexedDB storage', () => {
  it('stores only capped imports and can delete all imported data', async () => {
    const games = Array.from({ length: 28 }, (_, index) => ({ url: `https://chess.com/${index}`, endTime: 1_800_000_000_000 - index, pgn: '1. e4 *' }));
    const saved = await saveReportGames(games, { maxGames: 25, lookbackDays: 30, now: 1_800_000_000_000 });
    expect(saved).toHaveLength(25);
    expect(await loadReportGames()).toHaveLength(25);
    await clearReportGames();
    expect(await loadReportGames()).toEqual([]);
  });
});
