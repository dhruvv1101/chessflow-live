import { test as base, expect } from '@playwright/test';
import { Chess } from 'chess.js';

export const test = base.extend({
  page: async ({ page }, use) => {
    // Default browser tests never depend on the configured engine host or a running container.
    await page.route('**/health', (route) => route.fulfill({
      json: { ok: false, engine: 'Stockfish test double', threads: 1, hash_mb: 16 },
    }));
    await page.route('**/analyze', async (route) => {
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
    await page.route('**/api/coach', (route) => route.fulfill({ status: 200, json: {
      provider: 'stockfish', model: null, fallback: true, flags: ['test_fixture'],
      explanation: { what_happened: 'Stockfish test evidence.', why_bad: '', opponent_punishment: '', position_deterioration: '', punishment_line: [], tactical_idea: '', winning_plan: '', lesson: '', elo_tip: '' },
    } }));
    await page.route('**/api/coach/analyze', (route) => route.fulfill({ status: 200, json: {
      provider: 'stockfish', model: null, fallback: true, flags: ['test_fixture'],
      explanation: { what_happened: 'Stockfish test evidence.', why_bad: '', opponent_punishment: '', position_deterioration: '', punishment_line: [], tactical_idea: '', winning_plan: '', lesson: '', elo_tip: '' },
    } }));
    await use(page);
  },
});

export { expect };
