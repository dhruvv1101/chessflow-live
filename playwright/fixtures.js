import { test as base, expect } from '@playwright/test';
import { Chess } from 'chess.js';

export const test = base.extend({
  page: async ({ page }, use) => {
    // Keep unrelated UI tests hermetic while the browser engine is the fallback.
    // Engine-routing tests install a later, more specific server response.
    await page.route('http://localhost:8090/health', (route) => route.fulfill({
      json: { ok: true, engine: 'Stockfish test double', threads: 1, hash_mb: 16 },
    }));
    await page.route('http://localhost:8090/analyze', async (route) => {
      const { fen } = route.request().postDataJSON();
      const board = new Chess(fen);
      const lines = board.moves({ verbose: true }).slice(0, 3).map((move, index) => {
        const uci = `${move.from}${move.to}${move.promotion || ''}`;
        return { rank: index + 1, uci, san: move.san, pv_uci: [uci], pv_san: [move.san], cp_white: 0, mate_white: null };
      });
      await route.fulfill({ json: {
        best_uci: lines[0]?.uci, engine: 'Stockfish test double', depth: 8, nodes: 800,
        time_ms: 10, lines,
      } });
    });
    await use(page);
  },
});

export { expect };
