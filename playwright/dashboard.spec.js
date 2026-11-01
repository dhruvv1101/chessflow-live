import { test, expect } from './fixtures.js';

test('dashboard adapts to phone and desktop widths', async ({ page }) => {
  await page.route('**/health', (route) => route.fulfill({ json: { ok: true, engine: 'Stockfish 19', threads: 2, hash_mb: 128 } }));
  await page.route('**/analyze', (route) => route.fulfill({ json: { best_uci: 'e2e4', engine: 'Stockfish 19', depth: 18, nodes: 1234, time_ms: 20, lines: [1, 2, 3].map((rank) => ({ rank, uci: 'e2e4', san: 'e4', pv_uci: ['e2e4'], pv_san: ['e4'], cp_white: 25, mate_white: null })) } }));
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /Play now\.\s*Think deeper\./ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Start a game' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Game board' })).toBeVisible();
  await expect(page.getByLabel('Choose your side')).toBeVisible();
  await expect(page.getByLabel('Choose difficulty')).toBeVisible();
  await expect(page.getByRole('button', { name: /Review/ })).toBeDisabled();
  await expect(page.locator('.board-wrap')).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  expect(await page.locator('.hero h1 span').nth(1).evaluate((element) => element.getBoundingClientRect().right)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/chessflow-phone-390x844.png' });

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('.game-layout')).toBeVisible();
  await expect(page.locator('.side-grid')).toBeVisible();
  await page.screenshot({ path: 'test-results/chessflow-desktop-1280x800.png' });

  await page.getByRole('button', { name: 'White' }).click();
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
  await expect(page.locator('.count-badge')).toHaveText('2 ply', { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Game board' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Best move analysis' })).toBeVisible();
  expect(pageErrors).toEqual([]);

  await page.getByRole('button', { name: /Get a hint/ }).click();
  await expect(page.locator('.analysis-side').nth(0).locator('.analysis-table tbody tr')).toHaveCount(3, { timeout: 30_000 });
  await expect(page.locator('.board-wrap')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('pieces retain consistent rendered styles after e2-e4 and the AI reply', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'White' }).click();
  const source = page.locator('#chessboard-piece-wP-e2');
  const target = page.locator('[data-square="e4"]');
  await source.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.count-badge')).toHaveText('2 ply', { timeout: 30_000 });

  const styles = await page.locator('.board-wrap [data-piece]').evaluateAll((pieces) => pieces.map((element) => {
    const svg = element.querySelector('svg');
    const paintedShape = svg?.querySelector('g') || svg;
    return {
      id: element.id,
      className: typeof element.className === 'string' ? element.className : element.className.baseVal,
      type: element.getAttribute('data-piece'),
      opacity: getComputedStyle(element).opacity,
      filter: getComputedStyle(element).filter,
      fill: paintedShape ? getComputedStyle(paintedShape).fill : null,
    };
  }));
  console.log('Piece style audit before fix:', JSON.stringify(styles));

  const byType = Map.groupBy(styles, (piece) => piece.type);
  for (const [type, pieces] of byType) {
    expect(pieces, `${type} pieces should be fully opaque`).toEqual(expect.arrayContaining([
      expect.objectContaining({ opacity: '1', filter: 'none' }),
    ]));
    expect(new Set(pieces.map((piece) => piece.opacity)).size, `${type} opacity`).toBe(1);
    expect(new Set(pieces.map((piece) => piece.filter)).size, `${type} filter`).toBe(1);
    expect(new Set(pieces.map((piece) => piece.fill)).size, `${type} fill`).toBe(1);
    expect(pieces.every((piece) => piece.opacity === '1'), `${type} opacity value`).toBe(true);
    expect(pieces.every((piece) => piece.filter === 'none'), `${type} filter value`).toBe(true);
  }
});

test('copies the full in-progress game PGN and opens that game in review', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.getByRole('button', { name: 'White' }).click();
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
  await expect(page.locator('.count-badge')).toHaveText('2 ply', { timeout: 30_000 });

  await page.getByRole('button', { name: 'Copy PGN' }).click();
  await expect(page.locator('.pgn-action-status')).toHaveText('PGN copied');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('[Event "ChessFlow Live game"]');
  expect(copied).toContain('[Result "*"]');
  expect(copied).toContain('1. e4');

  await page.getByRole('button', { name: 'Analyze this game' }).click();
  await expect(page.getByRole('heading', { name: 'Review notes' })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.review-progress-label')).toHaveText('Game in progress');
});
