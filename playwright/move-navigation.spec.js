import { test, expect } from './fixtures.js';

async function playMove(page, from, to) {
  await page.locator(`[data-square="${from}"]`).click();
  await page.locator(`[data-square="${to}"]`).click();
}

test('move list, navigation controls, keyboard and replay preserve the live game history', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start two-player game' }).click();
  await playMove(page, 'e2', 'e4');
  await playMove(page, 'e7', 'e5');
  await expect(page.locator('.count-badge')).toHaveText('2 ply');
  await expect(page.locator('.move-position')).toContainText('Position 2 of 2');

  await page.getByRole('button', { name: 'White move 1: e4' }).click();
  await expect(page.locator('.move-position')).toContainText('Position 1 of 2');
  await expect(page.locator('.turn-chip')).toContainText('Black to move');
  await expect(page.locator('.count-badge')).toHaveText('2 ply');

  await page.getByRole('button', { name: 'Go to first move' }).click();
  await expect(page.locator('.move-position')).toContainText('Position 0 of 2');
  await page.getByRole('button', { name: 'Next move' }).click();
  await expect(page.locator('.move-position')).toContainText('Position 1 of 2');
  await page.getByRole('button', { name: 'Go to last move' }).click();
  await expect(page.locator('.move-position')).toContainText('Position 2 of 2');
  await page.getByRole('button', { name: 'Previous move' }).click();
  await expect(page.locator('.move-position')).toContainText('Position 1 of 2');

  await page.locator('.board-wrap').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.move-position')).toContainText('Position 0 of 2');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.move-position')).toContainText('Position 1 of 2');

  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause replay' })).toBeVisible();
  await expect(page.locator('.move-position')).toContainText('Position 2 of 2', { timeout: 3000 });
  await expect(page.getByRole('button', { name: 'Play replay' })).toBeVisible();
  await expect(page.locator('.count-badge')).toHaveText('2 ply');
  await page.getByRole('button', { name: 'Undo one ply' }).click();
  await expect(page.locator('.count-badge')).toHaveText('1 ply');
});
