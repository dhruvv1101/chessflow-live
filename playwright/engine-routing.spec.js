import { expect, test } from './fixtures.js';

async function startHint(page, forceServer = false) {
  await page.goto('/');
  if (forceServer) {
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByLabel('Hint engine').selectOption('server');
    await page.getByRole('button', { name: 'Close settings' }).click();
  }
  await page.getByRole('button', { name: 'Get a hint' }).click();
}

test('uses the mocked Stockfish API and shows engine identity, depth and search info', async ({ page }) => {
  await page.route('**/health', (route) => route.fulfill({ json: { ok: true, engine: 'Stockfish 19', threads: 2, hash_mb: 128 } }));
  await page.route('**/analyze', (route) => route.fulfill({ json: {
    best_uci: 'e2e4', engine: 'Stockfish 19', depth: 18, nodes: 123456, time_ms: 3000,
    lines: [{ rank: 1, uci: 'e2e4', san: 'e4', pv_uci: ['e2e4', 'e7e5'], pv_san: ['e4', 'e5'], cp_white: 32, mate_white: null }],
  } }));
  await startHint(page, true);
  await expect(page.locator('.engine-info')).toContainText('Server engine: Stockfish 19, depth 18');
  await expect(page.locator('.engine-info')).toContainText('123456 nodes');
  await expect(page.getByRole('status', { name: 'Engine server: Online' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  const serverDetails = page.locator('.server-engine-details');
  await expect(serverDetails).toContainText('Stockfish 19');
  await expect(serverDetails).toContainText('2');
  await expect(serverDetails).toContainText(/\d+ ms/);
});

test('falls back visibly to browser engine when server returns 503', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/health', (route) => route.fulfill({ json: { ok: true, engine: 'Stockfish 19', threads: 2, hash_mb: 128 } }));
  await page.route('**/analyze', (route) => route.fulfill({ status: 503, json: { detail: 'busy' } }));
  await page.route('**/engine/stockfish-19-single.js', (route) => route.fulfill({ status: 503, body: 'Full engine unavailable' }));
  await startHint(page, true);
  await expect(page.locator('.engine-info')).toContainText('Using browser engine: Stockfish 19');
  await expect(page.locator('.engine-info')).toContainText('Lite single-thread');
  await expect(page.getByRole('status', { name: 'Engine server: Using browser engine' })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('falls back visibly to browser engine when mocked server health and analysis fail', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/health', (route) => route.abort('failed'));
  await page.route('**/analyze', (route) => route.abort('failed'));
  await page.route('**/engine/stockfish-19-single.js', (route) => route.abort('failed'));
  await startHint(page, true);
  await expect(page.locator('.engine-info')).toContainText('Using browser engine: Stockfish 19');
  await expect(page.locator('.engine-info')).toContainText('Lite single-thread');
  expect(pageErrors).toEqual([]);
});
