import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { clearAnalysisCache, getCachedAnalysis, putCachedAnalysis, getCachedGameAnalysis, putCachedGameAnalysis } from './analysisCache.js';

afterEach(async () => clearAnalysisCache());

describe('report analysis IndexedDB cache', () => {
  it('keys cached positions by normalized FEN and depth', async () => {
    const score = { whiteScore: { cp: 123, mate: null }, bestMoveUci: 'e2e4', pvUci: ['e2e4'], depth: 10, nodes: 500 };
    await putCachedAnalysis('  8/8/8/8/8/8/8/K6k w - - 0 1 ', 10, score);

    await expect(getCachedAnalysis('8/8/8/8/8/8/8/K6k   w - - 0 1', 10)).resolves.toEqual(score);
    await expect(getCachedAnalysis('8/8/8/8/8/8/8/K6k w - - 0 2', 10)).resolves.toBeNull();
    await expect(getCachedAnalysis('8/8/8/8/8/8/8/K6k w - - 0 1', 11)).resolves.toBeNull();
  });

  it('stores the full per-game move analysis for report and tree reuse', async () => {
    const rows = [{ ply: 1, classification: 'Good' }, { ply: 2, classification: 'Blunder' }];
    await putCachedGameAnalysis('game-key', 10, rows);
    await expect(getCachedGameAnalysis('game-key', 10)).resolves.toEqual(rows);
    await expect(getCachedGameAnalysis('game-key', 11)).resolves.toBeNull();
    await clearAnalysisCache();
    await expect(getCachedGameAnalysis('game-key', 10)).resolves.toBeNull();
  });
});
