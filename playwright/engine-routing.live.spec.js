import { expect, test } from '@playwright/test';

const configured = Boolean(process.env.VITE_ENGINE_API_URL);

async function useServerRoute(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Hint engine').selectOption('server');
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.getByRole('button', { name: 'Get a hint' }).click();
}

test('live local engine returns Stockfish identity and depth', async ({ page }) => {
  test.skip(process.env.RUN_LIVE_ENGINE_TESTS !== '1' || !configured, 'Set RUN_LIVE_ENGINE_TESTS=1 and VITE_ENGINE_API_URL, then start the local engine container.');
  await useServerRoute(page);
  await expect(page.locator('.engine-info')).toContainText('Server engine: Stockfish 19, depth', { timeout: 30_000 });
  await expect(page.locator('.engine-info')).toContainText('nodes');
});

test('live client falls back after the local engine server is stopped', async ({ page }) => {
  test.skip(process.env.RUN_LIVE_ENGINE_STOPPED_TESTS !== '1' || !configured, 'Set RUN_LIVE_ENGINE_STOPPED_TESTS=1 and VITE_ENGINE_API_URL after stopping the local engine container.');
  await useServerRoute(page);
  await expect(page.locator('.engine-info')).toContainText('Using browser engine: Stockfish 19', { timeout: 30_000 });
});
