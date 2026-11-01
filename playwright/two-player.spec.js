import { test, expect } from './fixtures.js';

async function playMove(page, from, to) {
  await page.locator(`[data-square="${from}"]`).click();
  await page.locator(`[data-square="${to}"]`).click();
}

async function setTheme(page, theme) {
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByLabel('Theme').selectOption(theme);
  await dialog.getByRole('button', { name: 'Close settings' }).click();
}

test('two-player pass-and-play, both-side hints, auto flip and persistence', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Two players' })).toBeVisible();
  await page.getByLabel('White name').fill('  Asha  ');
  await page.getByLabel('Black name').fill('Rohan');
  await page.getByLabel('Two-player setup orientation').selectOption('auto');
  await page.screenshot({ path: 'docs/screenshots/two-player-setup-light-390x844.png', fullPage: true });
  await setTheme(page, 'dark');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: 'docs/screenshots/two-player-setup-dark-1280x800.png', fullPage: true });

  await page.getByRole('button', { name: 'Start two-player game' }).click();
  await expect(page.locator('.turn-chip')).toContainText('Asha to move (White)');
  await page.screenshot({ path: 'docs/screenshots/two-player-game-dark-1280x800.png', fullPage: true });
  await setTheme(page, 'light');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'docs/screenshots/two-player-game-light-390x844.png', fullPage: true });

  await playMove(page, 'e2', 'e4');
  await expect(page.locator('.turn-chip')).toContainText('Rohan to move (Black)');
  const e8AfterWhite = await page.locator('[data-square="e8"]').boundingBox();
  const e1AfterWhite = await page.locator('[data-square="e1"]').boundingBox();
  expect(e8AfterWhite.y).toBeGreaterThan(e1AfterWhite.y);
  await playMove(page, 'e7', 'e5');
  await expect(page.locator('.turn-chip')).toContainText('Asha to move (White)');

  await page.getByRole('button', { name: 'Hint for Asha' }).click();
  await expect(page.locator('.analysis-side').nth(0).locator('.analysis-table tbody tr')).toHaveCount(3, { timeout: 30_000 });
  let highlighted = await page.locator('.hint-square-highlight').evaluateAll((squares) => squares.map((square) => square.dataset.hintSquare));
  expect(highlighted).toHaveLength(2);
  expect(highlighted.every((square) => square[1] === '1' || square[1] === '2' || square[1] === '3' || square[1] === '4')).toBe(true);

  await playMove(page, 'g1', 'f3');
  await expect(page.locator('.turn-chip')).toContainText('Rohan to move (Black)');
  await page.getByRole('button', { name: 'Hint for Rohan' }).click();
  await expect(page.locator('.analysis-side').nth(1).locator('.analysis-table tbody tr')).toHaveCount(3, { timeout: 30_000 });
  highlighted = await page.locator('.hint-square-highlight').evaluateAll((squares) => squares.map((square) => square.dataset.hintSquare));
  expect(highlighted).toHaveLength(2);
  expect(highlighted.every((square) => square[1] === '5' || square[1] === '6' || square[1] === '7' || square[1] === '8')).toBe(true);

  await page.getByRole('button', { name: 'Undo one ply' }).click();
  await expect(page.locator('.count-badge')).toHaveText('2 ply');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Resume game' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume game' }).click();
  await expect(page.locator('.count-badge')).toHaveText('2 ply');
  await expect(page.locator('.turn-chip')).toContainText('Asha to move (White)');
  expect(errors).toEqual([]);
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 1280);
});

test('hints off hides hint and analysis controls; move during search discards stale hint', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Hints allowed').uncheck();
  await page.getByRole('button', { name: 'Start two-player game' }).click();
  await expect(page.getByRole('button', { name: /Hint for/ })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Best move analysis' })).toHaveCount(0);
  await expect(page.getByText('Hints are disabled for this game.')).toBeVisible();
  await page.getByRole('button', { name: 'Switch to AI mode' }).click();

  await page.getByLabel('Hints allowed').check();
  await page.getByRole('button', { name: 'Start two-player game' }).click();
  await page.getByRole('button', { name: 'Hint for White' }).click();
  await playMove(page, 'e2', 'e4');
  await expect(page.locator('.count-badge')).toHaveText('1 ply');
  await expect(page.locator('.analysis-side').nth(0).locator('.analysis-table')).toHaveCount(0);
  await expect(page.locator('.analysis-side').nth(1).getByText('Ask for a hint to reveal the leading lines.')).toBeVisible();
});

test('draw offer accepts or declines and resign requires a selected player plus confirmation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start two-player game' }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Offer draw' }).click();
  await expect(page.locator('.game-message-card')).toContainText('Draw agreed.');

  await page.getByRole('button', { name: 'New game' }).last().click();
  let dialogIndex = 0;
  page.on('dialog', (dialog) => { if (dialogIndex++ === 0) dialog.accept('White'); else dialog.accept(); });
  await page.getByRole('button', { name: 'Resign' }).click();
  await expect(page.getByText('Player resigned.')).toBeVisible();
});
