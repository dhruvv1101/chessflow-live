import { test, expect } from './fixtures.js';
import { Chess } from 'chess.js';

const pgn = '[Event "Chess.com game"]\n[White "Dhruv"]\n[Black "Opponent"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1';

test('imports public Chess.com games, analyzes one, and starts user-perspective practice', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const game = new Chess();
  game.move('f3'); game.move('e5');
  const beforeG4 = game.fen();
  game.move('g4');
  const afterG4 = game.fen();
  game.move('Qh4#');
  const engineReplies = {};
  const replay = new Chess();
  for (const san of game.history()) {
    const candidate = replay.moves({ verbose: true })[0];
    engineReplies[replay.fen()] = `${candidate.from}${candidate.to}${candidate.promotion || ''}`;
    replay.move(san);
  }
  const best = new Chess(beforeG4).moves({ verbose: true })[0];
  engineReplies[beforeG4] = `${best.from}${best.to}${best.promotion || ''}`;
  const workerScript = `let fen='';const replies=${JSON.stringify(engineReplies)};self.onmessage=(event)=>{const value=String(event.data);if(value==='uci'){self.postMessage('id name Stockfish 19 Chess.com Test');self.postMessage('uciok');}else if(value==='isready'){self.postMessage('readyok');}else if(value.startsWith('position fen ')){fen=value.slice(13);}else if(value.startsWith('go ')){const move=replies[fen]||'${engineReplies[beforeG4]}';const cp=fen==='${afterG4}'?400:0;self.postMessage('info depth 8 nodes 800 score cp '+cp+' multipv 1 pv '+move);self.postMessage('bestmove '+move);}};`;
  await page.addInitScript(({ gamePgn }) => {
    const fetchOriginal = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const requestUrl = typeof input === 'string' ? input : input.url;
      if (requestUrl.includes('/api/chesscom') || requestUrl.includes('api.chess.com/pub/player/Dhruv/games/')) {
        const parsed = new URL(requestUrl, window.location.href);
        const body = parsed.searchParams.get('type') === 'archives' || parsed.pathname.endsWith('/archives')
          ? { archives: ['https://api.chess.com/pub/player/Dhruv/games/2026/11'] }
          : { games: [{ url: 'https://www.chess.com/game/live/123', pgn: gamePgn, end_time: 1_799_000_000, time_class: 'blitz', rules: 'chess', white: { username: 'Dhruv', rating: 1400, result: 'timeout' }, black: { username: 'Opponent', rating: 1500, result: 'win' }, accuracies: { white: 54, black: 87 } }] };
        return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', etag: 'fixture-etag' } });
      }
      return fetchOriginal(input, init);
    };
  }, { gamePgn: pgn });
  await page.route('**/engine/stockfish-19-single.js', (route) => route.fulfill({ contentType: 'application/javascript', body: workerScript }));
  await page.route('**/engine/stockfish-19-single.wasm', (route) => route.fulfill({ contentType: 'application/wasm', body: 'test-wasm' }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Import from Chess.com' }).click();
  await expect(page.getByRole('heading', { name: 'Import from Chess.com' })).toBeVisible();
  await expect(page.getByText("Chess.com doesn't offer a login for other sites, so we read your public games with your username. This doesn't prove who you are.")).toBeVisible();
  await page.getByLabel('Chess.com username or profile URL').fill('https://www.chess.com/member/Dhruv');
  await page.getByRole('button', { name: 'Load games' }).click();
  await expect(page.locator('.chesscom-game')).toHaveCount(1);
  await expect(page.locator('.chesscom-game')).toContainText('vs Opponent');
  await expect(page.locator('.chesscom-game')).toContainText('Your accuracy 54%');
  await expect(page.locator('.chesscom-game')).toContainText('Opponent accuracy 87%');
  await page.locator('.chesscom-game').getByRole('button', { name: 'Save to my games' }).click();
  await expect(page.getByText('Game saved in this browser.')).toBeVisible();
  await page.locator('.chesscom-game').getByRole('button', { name: 'Analyze' }).click();
  await expect(page.locator('.review-table tbody tr')).toHaveCount(4, { timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'You move 2: g4, Blunder' })).toBeVisible();
  await page.getByRole('button', { name: 'You move 2: g4, Blunder' }).click();
  await page.getByRole('button', { name: 'Practice This Mistake' }).click();
  await expect(page.locator('.practice-banner')).toContainText('Practice mode: find a better move for White');

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

test('direct Chess.com API CORS probe (opt-in; public read only)', async ({ page }) => {
  test.skip(process.env.RUN_CHESSCOM_CORS_PROBE !== 'true', 'Set RUN_CHESSCOM_CORS_PROBE=true to make one public archives request from the browser.');
  await page.goto('/');
  const result = await page.evaluate(async () => {
    try {
      const response = await fetch('https://api.chess.com/pub/player/hikaru/games/archives');
      return { corsReadable: true, status: response.status, contentType: response.headers.get('content-type') };
    } catch (error) { return { corsReadable: false, errorName: error.name, errorMessage: error.message }; }
  });
  console.log('Direct Chess.com browser API probe:', result);
  expect(result.corsReadable, JSON.stringify(result)).toBe(true);
});
