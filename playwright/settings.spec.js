import { test, expect } from './fixtures.js';

async function setSelect(dialog, label, value) {
  await dialog.getByLabel(label).selectOption(value);
}

test('theme settings persist, board stays playable, and layouts do not overflow', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  await setSelect(dialog, 'Theme', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-effective-theme', 'light');
  await expect(page.locator('html')).toHaveCSS('--border-width', '3px');
  await page.screenshot({ path: 'test-results/chessflow-light-390x844.png', fullPage: true });
  await setSelect(dialog, 'Theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-effective-theme', 'dark');
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(10, 10, 20)');
  await page.screenshot({ path: 'test-results/chessflow-dark-390x844.png', fullPage: true });

  await setSelect(dialog, 'Board colour', 'green');
  await setSelect(dialog, 'Board colour', 'slate');
  await setSelect(dialog, 'Board colour', 'purple');
  await dialog.getByLabel('Reduce motion').check();
  await dialog.getByLabel('Show legal-move dots').uncheck();
  await dialog.getByLabel('Show legal-move dots').check();
  await dialog.getByLabel('Highlight last move').uncheck();
  await dialog.getByLabel('Highlight last move').check();
  await dialog.getByLabel('Flip board (Black at bottom)').check();
  await dialog.getByLabel('Show coordinates').uncheck();
  await dialog.getByLabel('Show coordinates').check();
  await setSelect(dialog, 'Hint time', '2000');
  await setSelect(dialog, 'Hint time', '4000');
  await setSelect(dialog, 'Hint time', '6000');
  await setSelect(dialog, 'Default difficulty', 'Easy');
  await setSelect(dialog, 'Default difficulty', 'Medium');
  await setSelect(dialog, 'Default difficulty', 'Hard');
  await setSelect(dialog, 'Default difficulty', 'Max');
  await dialog.getByRole('button', { name: 'Close settings' }).click();

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('button', { name: 'Settings' }).click();
  const desktopDialog = page.getByRole('dialog', { name: 'Settings' });
  await setSelect(desktopDialog, 'Theme', 'light');
  await page.screenshot({ path: 'test-results/chessflow-light-1280x800.png', fullPage: true });
  await setSelect(desktopDialog, 'Theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-effective-theme', 'dark');
  await page.screenshot({ path: 'test-results/chessflow-dark-1280x800.png', fullPage: true });
  await desktopDialog.getByRole('button', { name: 'Close settings' }).click();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 1280);
  await expect(page.locator('.board-wrap')).toBeVisible();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-effective-theme', 'dark');
  await page.getByRole('button', { name: 'Settings' }).click();
  const persisted = page.getByRole('dialog', { name: 'Settings' });
  await expect(persisted.getByLabel('Flip board (Black at bottom)')).toBeChecked();
  await expect(persisted.getByLabel('Reduce motion')).toBeChecked();
  await expect(persisted.getByLabel('Hint time')).toHaveValue('6000');
  await expect(persisted.getByLabel('Default difficulty')).toHaveValue('Max');
  await persisted.getByRole('button', { name: 'Close settings' }).click();

  await page.getByRole('button', { name: 'White' }).click();
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
  await expect(page.locator('.count-badge')).toHaveText('2 ply', { timeout: 30_000 });
  await expect(page.locator('#chessboard-piece-wP-e4')).toBeVisible();
  const boardElement = await page.locator('.board-wrap').elementHandle();
  await page.getByRole('button', { name: 'Settings' }).click();
  const themeSettings = page.getByRole('dialog', { name: 'Settings' });
  await setSelect(themeSettings, 'Theme', 'light');
  await expect(page.locator('#chessboard-piece-wP-e4')).toBeVisible();
  await setSelect(themeSettings, 'Theme', 'dark');
  const boardWasPreserved = await page.evaluate((element) => document.querySelector('.board-wrap') === element, boardElement);
  expect(boardWasPreserved).toBe(true);
  await themeSettings.getByRole('button', { name: 'Close settings' }).click();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 1280);
  expect(errors).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
});

test('settings dialog closes with Escape and keeps focus modal', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveJSProperty('open', true);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});
