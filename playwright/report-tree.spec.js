import { test, expect } from './fixtures.js';

const monthUrl = (date) => `https://api.chess.com/pub/player/testplayer/games/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
const pgn = '[Event "Live Chess"]\n[White "TestPlayer"]\n[Black "Opponent"]\n[Result "1-0"]\n[ECO "C50"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d3 Bc5 5. c3 d6 6. O-O O-O 7. Re1 a6 8. Bb3 Ba7 9. Nbd2 h6 10. Nf1 Be6 11. Ng3 Qd7 12. Be3 Bxe3 13. Rxe3 Rad8 14. d4 exd4 15. cxd4 Bg4 16. h3 Bxf3 17. Rxf3 Nxd4 18. Rd3 1-0';

async function assertTreeContrast(page) {
  const ratios = await page.locator('.report-radial-svg').evaluate((svg) => {
    const rgb = (value) => value.match(/[\d.]+/g).slice(0, 3).map(Number).map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    const luminance = (value) => { const [r, g, b] = rgb(value); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const contrast = (a, b) => { const values = [luminance(a), luminance(b)].sort((x, y) => y - x); return (values[0] + 0.05) / (values[1] + 0.05); };
    const surface = getComputedStyle(svg.closest('.report-tree-card')).backgroundColor;
    return {
      nodeStroke: contrast(getComputedStyle(svg.querySelector('.report-tree-node circle')).stroke, surface),
      line: contrast(getComputedStyle(svg.querySelector('.report-tree-link')).stroke, surface),
      ring: contrast(getComputedStyle(svg.querySelector('.report-tree-ring')).stroke, surface),
      openingLabel: svg.querySelector('.report-tree-opening-label') ? contrast(getComputedStyle(svg.querySelector('.report-tree-opening-label')).fill, surface) : 5,
    };
  });
  expect(ratios.nodeStroke).toBeGreaterThanOrEqual(3);
  expect(ratios.line).toBeGreaterThanOrEqual(3);
  expect(ratios.ring).toBeGreaterThanOrEqual(3);
  expect(ratios.openingLabel).toBeGreaterThanOrEqual(4.5);
}

test('radial tree fits mobile and desktop, responds to keyboard and theme tokens', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class MockReportWorker {
      constructor(url, options) { this.url = url; this.native = url.includes('stockfish-19-single.js') ? null : new NativeWorker(url, options); }
      postMessage(message) {
        if (String(message).startsWith('position fen ')) this.fen = String(message).slice('position fen '.length);
        if (this.native) return this.native.postMessage(message);
        if (message === 'uci') queueMicrotask(() => { this.onmessage?.({ data: 'id name Stockfish Report Test' }); this.onmessage?.({ data: 'uciok' }); });
        else if (message === 'isready') queueMicrotask(() => this.onmessage?.({ data: 'readyok' }));
        else if (String(message).startsWith('go depth')) {
          const depth = Number(String(message).split(' ')[2]) || 10;
          const bestMove = this.fen?.split(' ')[1] === 'b' ? 'e7e5' : 'g1f3';
          queueMicrotask(() => {
            this.onmessage?.({ data: `info depth ${depth} score cp 20 nodes 100 pv ${bestMove}` });
            this.onmessage?.({ data: `bestmove ${bestMove}` });
          });
        }
      }
      terminate() { this.native?.terminate(); }
    };
  });
  await page.route('**/api/chesscom/games?*', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('type') === 'archives') return route.fulfill({ json: { archives: [monthUrl(new Date())] } });
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
  await expect(page.locator('.report-tree-node').first()).toBeVisible({ timeout: 30_000 });
  await page.locator('.report-tree-controls input[type="range"]').press('End');
  await expect(page.locator('.report-tree-node')).toHaveCount(13, { timeout: 30_000 });
  await expect(page.locator('.report-tree-root-label')).toHaveText('Start');
  await expect(page.locator('.report-tree-ring-label').first()).toBeVisible();
  await expect(page.locator('.report-tree-label').first()).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 1280);
  const canvasFit = await page.locator('.report-radial-svg').evaluate((svg) => {
    const rect = svg.getBoundingClientRect();
    const nodes = [...svg.querySelectorAll('.report-tree-node')].map((node) => node.getBoundingClientRect());
    return nodes.every((node) => node.left >= rect.left - 1 && node.right <= rect.right + 1 && node.top >= rect.top - 1 && node.bottom <= rect.bottom + 1);
  });
  expect(canvasFit).toBe(true);
  await assertTreeContrast(page);
  await page.screenshot({ path: 'test-results/report-tree-light-1280x900.png', fullPage: true });

  const firstNode = page.locator('.report-tree-node').first();
  await firstNode.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary', { name: 'Selected position details' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Train this line' })).toHaveCount(0);
  await expect(page.getByRole('grid', { name: /Position preview/ })).toBeVisible();
  await expect(page.getByText(/1\.e4 e5/)).toBeVisible();
  const squareDimensions = await page.locator('.report-fen-board').evaluate((board) => {
    const cells = [...board.querySelectorAll('.report-fen-square')].map((cell) => cell.getBoundingClientRect());
    return { widths: cells.map((cell) => cell.width), heights: cells.map((cell) => cell.height) };
  });
  expect(Math.max(...squareDimensions.widths) - Math.min(...squareDimensions.widths)).toBeLessThanOrEqual(1);
  expect(Math.max(...squareDimensions.heights) - Math.min(...squareDimensions.heights)).toBeLessThanOrEqual(1);
  await expect(page.locator('.report-tree-detail .meta-line')).toContainText('PLY 3 · 2.Nf3');

  const lightRoot = await page.locator('.report-tree-node circle').first().evaluate((element) => getComputedStyle(element).fill);
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; document.documentElement.dataset.effectiveTheme = 'dark'; });
  const darkRoot = await page.locator('.report-tree-node circle').first().evaluate((element) => getComputedStyle(element).fill);
  expect(darkRoot).not.toBe(lightRoot);
  await assertTreeContrast(page);
  await page.screenshot({ path: 'test-results/report-tree-dark-1280x900.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  await page.getByRole('group', { name: 'Tree side' }).getByRole('button', { name: 'Black' }).click();
  await page.getByRole('group', { name: 'Tree side' }).getByRole('button', { name: 'White' }).click();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  await page.screenshot({ path: 'test-results/report-tree-dark-390x844.png', fullPage: true });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; document.documentElement.dataset.effectiveTheme = 'light'; });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  await page.screenshot({ path: 'test-results/report-tree-light-390x844.png', fullPage: true });
  expect(errors).toEqual([]);
});
