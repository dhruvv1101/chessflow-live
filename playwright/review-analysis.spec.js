import { test, expect } from './fixtures.js';

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
});
