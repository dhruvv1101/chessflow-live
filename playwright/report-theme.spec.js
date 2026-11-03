import { test, expect } from './fixtures.js';

test('Report theme selector updates the shared app theme without leaving Report', async ({ page }) => {
  await page.goto('/#report');
  const theme = page.getByLabel('Report theme');
  await expect(theme).toBeVisible();

  await theme.selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-effective-theme', 'dark');
  await expect(page).toHaveURL(/#report$/);

  await theme.selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-effective-theme', 'light');
  await expect(page).toHaveURL(/#report$/);
});
