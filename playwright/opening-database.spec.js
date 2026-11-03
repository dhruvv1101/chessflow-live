import { test, expect } from './fixtures.js';
import { Chess } from 'chess.js';

test('shows a named opening and book exit for a reviewed game without layout overflow', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const game = new Chess();
  const moves = ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qd8', 'Bb5+', 'Bd7', 'Bxd7+', 'Qxd7', 'Nf3', 'Nc6', 'd3', 'Nf6', 'Bg5', 'h6', 'Bh4', 'Nd4', 'Nxd4', 'Qxd4'];
  for (const san of moves) game.move(san);
  const engineMoves = {};
  const replay = new Chess();
  for (const san of moves) {
    const legal = replay.moves({ verbose: true })[0];
    engineMoves[replay.fen()] = `${legal.from}${legal.to}${legal.promotion || ''}`;
    replay.move(san);
  }
  engineMoves[replay.fen()] = replay.moves({ verbose: true }).map((move) => `${move.from}${move.to}${move.promotion || ''}`)[0];
  const worker = `let fen='';const moves=${JSON.stringify(engineMoves)};self.onmessage=(event)=>{const value=String(event.data);if(value==='uci'){self.postMessage('id name Stockfish 19 Opening Test');self.postMessage('uciok');}else if(value==='isready'){self.postMessage('readyok');}else if(value.startsWith('position fen ')){fen=value.slice(13);}else if(value.startsWith('go ')){const move=moves[fen]||'a7a6';self.postMessage('info depth 8 nodes 800 score cp 0 multipv 1 pv '+move);self.postMessage('bestmove '+move);}};`;
  await page.route('**/engine/stockfish-19-single.js', (route) => route.fulfill({ contentType: 'application/javascript', body: worker }));
  await page.route('**/engine/stockfish-19-single.wasm', (route) => route.fulfill({ contentType: 'application/wasm', body: 'test-wasm' }));
  await page.goto('/');
  await page.getByLabel('Paste a finished game PGN').fill(game.pgn({ maxWidth: 120 }));
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.locator('.review-table tbody tr')).toHaveCount(moves.length, { timeout: 90_000 });
  await expect(page.locator('.opening-analysis')).toContainText('B01 Scandinavian Defense', { timeout: 30_000 });
  await expect(page.locator('.opening-analysis')).toContainText('Left known theory at move 4 (Bb5+)');
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    for (const theme of ['light', 'dark']) {
      await page.getByRole('button', { name: 'Settings' }).click();
      await page.getByLabel('Theme').selectOption(theme);
      await page.getByRole('button', { name: 'Close settings' }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
  }
  expect(errors).toEqual([]);
});
