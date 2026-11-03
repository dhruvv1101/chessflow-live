import { test, expect } from './fixtures.js';

test('report guide opens accessibly and explains configured thresholds', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#report');
  await page.getByRole('button', { name: 'How to read this report' }).click();
  const guide = page.getByRole('dialog', { name: 'How to read this report' });
  await expect(guide).toBeVisible();
  await expect(guide).toContainText('fewer than 2 games');
  await expect(guide).toContainText('Low confidence means fewer than 3 games');
  await expect(guide).toContainText('at least 5 / 15 / 25 percentage points');
  await expect(guide).toContainText('at least 80% winning chances and dropped below 65%');
  await page.keyboard.press('Escape');
  await expect(guide).toBeHidden();
  await expect(page.getByRole('button', { name: 'How to read this report' })).toBeFocused();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
});
