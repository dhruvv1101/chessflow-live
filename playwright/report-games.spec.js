import { test, expect } from './fixtures.js';

const pgn = '[Event "Live Chess"]\n[White "TestPlayer"]\n[Black "Opponent"]\n[Result "1-0"]\n[ECO "C50"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d3 Bc5 5. c3 d6 1-0';
const archiveUrl = (date) => `https://api.chess.com/pub/player/testplayer/games/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

test('game reports show evaluation markers, explanations, and tree-linked game filters', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class MockReportWorker {
      constructor(url, options) { this.native = url.includes('stockfish-19-single.js') ? null : new NativeWorker(url, options); }
      postMessage(message) {
        if (this.native) return this.native.postMessage(message);
        if (message === 'uci') queueMicrotask(() => { this.onmessage?.({ data: 'id name Stockfish Report Test' }); this.onmessage?.({ data: 'uciok' }); });
        else if (message === 'isready') queueMicrotask(() => this.onmessage?.({ data: 'readyok' }));
        else if (String(message).startsWith('go depth')) {
          const depth = Number(String(message).split(' ')[2]) || 10;
          queueMicrotask(() => {
            this.onmessage?.({ data: `info depth ${depth} score cp 500 nodes 100 pv e2e4` });
            this.onmessage?.({ data: 'bestmove e2e4' });
          });
        }
      }
      terminate() { this.native?.terminate(); }
    };
  });
  await page.route('**/api/chesscom/games?*', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('type') === 'archives') return route.fulfill({ json: { archives: [archiveUrl(new Date())] } });
    const now = Math.floor(Date.now() / 1000);
    return route.fulfill({ json: { games: [1, 2].map((id) => ({
      url: `https://www.chess.com/game/live/${id}`, rules: 'chess', pgn,
      end_time: now - id, time_class: 'blitz', white: { username: 'TestPlayer' }, black: { username: 'Opponent' },
    })) } });
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/#report');
  await page.getByLabel('Chess.com username').fill('TestPlayer');
  await page.getByRole('button', { name: 'Import games' }).click();
  await expect(page.locator('.report-game-card')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Games', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Analyze game' }).first().click();
  await expect(page.getByRole('group', { name: 'Game win probability graph, from your perspective' })).toBeVisible();
  const marker = page.locator('.report-eval-marker').first();
  await expect(marker).toBeVisible();
  const markerGeometry = await marker.evaluate((group) => {
    const expected = { x: Number(group.dataset.x), y: Number(group.dataset.y) };
    const shape = group.querySelector('circle, rect, path');
    const tag = shape.tagName.toLowerCase();
    const actual = tag === 'circle'
      ? { x: Number(shape.getAttribute('cx')), y: Number(shape.getAttribute('cy')) }
      : tag === 'rect'
        ? { x: Number(shape.getAttribute('x')) + Number(shape.getAttribute('width')) / 2, y: Number(shape.getAttribute('y')) + Number(shape.getAttribute('height')) / 2 }
        : (() => { const parts = shape.getAttribute('d').match(/-?[\d.]+/g).map(Number); return { x: parts[0], y: parts[1] + 8 }; })();
    return { expected, actual, shape: tag, svgWidth: group.ownerSVGElement.getBoundingClientRect().width, gameCardWidth: group.closest('.report-game-card').getBoundingClientRect().width };
  });
  expect(markerGeometry.actual.x).toBe(markerGeometry.expected.x);
  expect(markerGeometry.actual.y).toBe(markerGeometry.expected.y);
  expect(markerGeometry.svgWidth).toBeGreaterThan(markerGeometry.gameCardWidth * 0.85);
  await expect(page.locator('.report-eval-legend .is-inaccuracy')).toBeVisible();
  await expect(page.locator('.report-eval-legend .is-mistake')).toHaveCSS('border-radius', '0px');
  await marker.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('What happened?').first()).toBeVisible();

  const firstLeak = page.locator('.report-insight-card').first();
  await expect(firstLeak).toBeVisible();
  await firstLeak.getByRole('button', { name: 'Explain', exact: true }).click();
  await expect(firstLeak.getByText('What happened?')).toBeVisible();
  await firstLeak.getByRole('button', { name: 'Show on tree' }).click();
  await expect(page.locator('.report-tree-node circle.is-highlighted').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show all games' })).toBeVisible();
  await page.getByRole('button', { name: 'Show all games' }).click();
  const treeNode = page.locator('.report-tree-node').first();
  await treeNode.focus();
  await page.keyboard.press('Enter');
  const positionDetails = page.getByRole('complementary', { name: 'Selected position details' });
  await expect(positionDetails).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(positionDetails).toBeHidden();
  await treeNode.focus();
  await page.keyboard.press('Enter');
  await positionDetails.getByRole('link', { name: /Show game/ }).first().click();
  await expect(page.locator('.report-games-count')).toContainText('Showing 1 game from the selected tree position or leak.');
  await page.getByRole('button', { name: 'Show all games' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  expect(errors).toEqual([]);
});
