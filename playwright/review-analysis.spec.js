import { test, expect } from './fixtures.js';
import { Chess } from 'chess.js';

test('imports a finished PGN, analyzes each ply, and synchronizes move history with the graph', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Hint time').selectOption('2000');
  await page.getByRole('button', { name: 'Close settings' }).click();

  await page.getByLabel('Paste a finished game PGN').fill('[Event "Review test"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0');
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByRole('heading', { name: 'Review notes' })).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('.review-table tbody tr')).toHaveCount(4, { timeout: 90_000 });
  await expect(page.locator('.evaluation-graph .graph-point')).toHaveCount(5);

  await page.getByRole('button', { name: 'Black move 1: e5' }).click();
  await expect(page.locator('.move-position')).toContainText('Position 2 of 4');
  await expect(page.locator('.turn-chip')).toContainText('White to move');
  await expect(page.locator('.coach-panel')).toContainText('e5');
  await expect(page.locator('.graph-cursor')).toHaveCount(1);
  await expect(page.locator('.count-badge')).toHaveText('4 ply');

  await page.getByRole('button', { name: /Show Opponent.s Plan/ }).click();
  await expect(page.locator('.hero-status')).toContainText("Stockfish's top reply after e5 is");
  await expect(page.locator('.coach-engine-details')).toHaveAttribute('open', '');
  await expect(page.locator('.coach-engine-details')).toContainText('Verified opponent continuation');

  const bestMoveText = await page.locator('.coach-engine-details p').first().textContent();
  const bestMove = /Best move:\s*([^\s·]+)/.exec(bestMoveText)?.[1];
  expect(bestMove).toBeTruthy();
  await page.getByRole('button', { name: 'Show Better Move' }).click();
  await expect(page.locator('.move-position')).toContainText('Position 1 of 4');
  await expect(page.locator('.hero-status')).toContainText(`Best move: ${bestMove}`);
  await expect(page.locator('.board-arrow-overlay .board-arrow.best')).toBeVisible();
});

test('practices a PGN blunder, plays on against mocked Stockfish, copies and reviews the practice game', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const source = new Chess();
  source.move('f3'); source.move('e5');
  const beforeG4 = source.fen();
  source.move('g4');
  const afterG4 = source.fen();
  const practiceStartFen = beforeG4;
  source.move('Qh4#');

  const practiceReply = new Chess(practiceStartFen);
  practiceReply.move('e4');
  const aiMove = practiceReply.moves({ verbose: true })[0];
  const aiUci = `${aiMove.from}${aiMove.to}${aiMove.promotion || ''}`;
  const engineReplies = {};
  const engineBoard = new Chess();
  for (const san of source.history()) {
    const candidate = engineBoard.moves({ verbose: true })[0];
    engineReplies[engineBoard.fen()] = `${candidate.from}${candidate.to}${candidate.promotion || ''}`;
    engineBoard.move(san);
  }
  const practiceBest = new Chess(practiceStartFen);
  const bestAtPractice = practiceBest.moves({ verbose: true })[0];
  engineReplies[practiceStartFen] = `${bestAtPractice.from}${bestAtPractice.to}${bestAtPractice.promotion || ''}`;
  const responseMap = JSON.stringify(engineReplies);
  const workerScript = `let fen='';const replies=${responseMap};self.onmessage=(event)=>{const value=String(event.data);if(value==='uci'){self.postMessage('id name Stockfish 19 Practice Test');self.postMessage('uciok');}else if(value==='isready'){self.postMessage('readyok');}else if(value.startsWith('position fen ')){fen=value.slice(13);}else if(value.startsWith('go ')){const move=replies[fen]||'${aiUci}';const cp=fen==='${afterG4}'?400:0;self.postMessage('info depth 8 nodes 800 score cp '+cp+' multipv 1 pv '+move);self.postMessage('bestmove '+move);}};`;
  await page.route('**/health', (route) => route.fulfill({ json: { ok: true, engine: 'Stockfish 19 test', threads: 1, hash_mb: 32 } }));
  await page.route('**/analyze', async (route) => {
    const { fen } = route.request().postDataJSON();
    const board = new Chess(fen);
    const moves = board.moves({ verbose: true }).slice(0, 3);
    const cp = fen === afterG4 ? -400 : 0;
    const lines = moves.map((move, index) => {
      const uci = `${move.from}${move.to}${move.promotion || ''}`;
      return { rank: index + 1, uci, san: move.san, pv_uci: [uci], pv_san: [move.san], cp_white: cp, mate_white: null };
    });
    await route.fulfill({ json: { best_uci: lines[0]?.uci || 'a7a6', engine: 'Stockfish 19 test', depth: 12, nodes: 1200, time_ms: 40, lines } });
  });
  await page.route('**/engine/stockfish-19-lite-single.js', (route) => route.fulfill({ contentType: 'application/javascript', body: workerScript }));
  await page.route('**/engine/stockfish-19-single.js', (route) => route.fulfill({ contentType: 'application/javascript', body: workerScript }));
  await page.route('**/engine/stockfish-19-single.wasm', (route) => route.fulfill({ contentType: 'application/wasm', body: 'test-wasm' }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('Paste a finished game PGN').fill('[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.locator('.review-table tbody tr')).toHaveCount(4, { timeout: 60_000 });
  await page.getByRole('button', { name: 'White move 2: g4, Blunder' }).click();
  await expect(page.getByRole('button', { name: 'Practice This Mistake' })).toBeEnabled();
  await page.getByRole('button', { name: 'Practice This Mistake' }).click();
  await expect(page.locator('.practice-banner')).toContainText('Practice mode: find a better move for White');

  await page.locator('[data-square="g2"]').click();
  await page.locator('[data-square="g4"]').click();
  await expect(page.locator('.practice-banner')).toContainText('That is the move from the game', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
  await expect(page.locator('.practice-banner')).toContainText('Good move', { timeout: 30_000 });
  await expect(page.locator('.move-history .history-number').first()).toHaveText('2.');
  await expect(page.locator('.move-history .history-number').nth(1)).toHaveText('2…', { timeout: 30_000 });
  await expect(page.locator('.move-history .history-move')).toHaveCount(2, { timeout: 30_000 });

  await page.getByRole('button', { name: 'Copy PGN' }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('[SetUp "1"]');
  expect(copied).toContain(`[FEN "${practiceStartFen}"]`);
  expect(copied).toContain('2. e4');
  await page.getByRole('button', { name: 'Analyze this practice game' }).click();
  await expect(page.getByRole('heading', { name: 'Review notes' })).toBeVisible({ timeout: 60_000 });

  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    for (const theme of ['light', 'dark']) {
      await page.getByRole('button', { name: 'Settings' }).click();
      await page.getByLabel('Theme').selectOption(theme);
      await page.getByRole('button', { name: 'Close settings' }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await expect(page.locator('.board-wrap')).toBeVisible();
    }
  }
  expect(errors).toEqual([]);
});
