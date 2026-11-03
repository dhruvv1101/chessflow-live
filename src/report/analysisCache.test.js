import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { clearAnalysisCache, getCachedAnalysis, putCachedAnalysis } from './analysisCache.js';

afterEach(async () => clearAnalysisCache());

describe('report analysis IndexedDB cache', () => {
  it('keys cached positions by normalized FEN and depth', async () => {
    const score = { whiteScore: { cp: 123, mate: null }, bestMoveUci: 'e2e4', pvUci: ['e2e4'], depth: 10, nodes: 500 };
    await putCachedAnalysis('  8/8/8/8/8/8/8/K6k w - - 0 1 ', 10, score);

    await expect(getCachedAnalysis('8/8/8/8/8/8/8/K6k   w - - 0 1', 10)).resolves.toEqual(score);
    await expect(getCachedAnalysis('8/8/8/8/8/8/8/K6k w - - 0 2', 10)).resolves.toBeNull();
    await expect(getCachedAnalysis('8/8/8/8/8/8/8/K6k w - - 0 1', 11)).resolves.toBeNull();
  });
});
