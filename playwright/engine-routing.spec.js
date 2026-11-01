import { expect, test } from '@playwright/test';

async function startHint(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Get a hint' }).click();
}

test('uses the configured local Stockfish API when it is available', async ({ page }) => {
  test.skip(!process.env.VITE_ENGINE_API_URL, 'Set VITE_ENGINE_API_URL and start the local analysis server to run this integration check.');
  await startHint(page);
  await expect(page.locator('.engine-info')).toContainText('Server engine: Stockfish 19, depth');
});

test('shows server engine identity, depth and search info for a hint', async ({ page }) => {
  await page.route('**/health', (route) => route.fulfill({ json: { ok: true, engine: 'Stockfish 19', threads: 2, hash_mb: 128 } }));
  await page.route('**/analyze', (route) => route.fulfill({ json: {
    best_uci: 'e2e4', engine: 'Stockfish 19', depth: 18, nodes: 123456, time_ms: 3000,
    lines: [{ rank: 1, uci: 'e2e4', san: 'e4', pv_uci: ['e2e4', 'e7e5'], pv_san: ['e4', 'e5'], cp_white: 32, mate_white: null }],
  } }));
  await startHint(page);
  await expect(page.locator('.engine-info')).toContainText('Server engine: Stockfish 19, depth 18');
  await expect(page.locator('.engine-info')).toContainText('123456 nodes');
});

test('falls back visibly to browser engine when server returns 503', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/health', (route) => route.fulfill({ json: { ok: true, engine: 'Stockfish 19', threads: 2, hash_mb: 128 } }));
  await page.route('**/analyze', (route) => route.fulfill({ status: 503, json: { detail: 'busy' } }));
  await page.route('**/engine/stockfish-19-single.js', (route) => route.fulfill({ status: 503, body: 'Full engine unavailable' }));
  await startHint(page);
  await expect(page.locator('.engine-info')).toContainText('Using browser engine: Stockfish 19');
  await expect(page.locator('.engine-info')).toContainText('Lite single-thread');
  expect(pageErrors).toEqual([]);
});

test('falls back visibly to browser engine when the server is stopped', async ({ page }) => {
  test.skip(process.env.CHECK_ENGINE_OFFLINE !== '1', 'Run with the local engine container stopped to check the real connection failure path.');
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/engine/stockfish-19-single.js', (route) => route.abort('failed'));
  await startHint(page);
  await expect(page.locator('.engine-info')).toContainText('Using browser engine: Stockfish 19');
  await expect(page.locator('.engine-info')).toContainText('Lite single-thread');
  expect(pageErrors).toEqual([]);
});
