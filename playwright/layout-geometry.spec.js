import { expect, test } from './fixtures.js';

const output = 'docs/screenshots';
const views = [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
];

async function selectTheme(page, theme) {
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByLabel('Theme').selectOption(theme);
  await expect(page.locator('html')).toHaveAttribute('data-effective-theme', theme);
  await dialog.getByRole('button', { name: 'Close settings' }).click();
}

async function noHorizontalOverflow(page, width) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(0);
}

test('responsive game and setup layouts remain aligned in both themes', async ({ page }) => {
  await page.route('**/health', (route) => route.fulfill({ json: { ok: false } }));
  await page.route('**/analyze', (route) => route.fulfill({ status: 503, json: { detail: 'offline' } }));

  for (const view of views) {
    for (const theme of ['light', 'dark']) {
      await page.setViewportSize(view);
      await page.goto('/');
      await selectTheme(page, theme);
      await noHorizontalOverflow(page, view.width);
      await expect(page.locator(`#theme-color-${theme}`)).toHaveAttribute('content', theme === 'dark' ? '#0A0A14' : '#FFD21F');
      await expect(page.locator(`#theme-color-${theme}`)).toHaveAttribute('media', 'all');

      const setup = page.locator('.setup-review-grid');
      const setupCard = page.locator('.local-setup-card');
      const pgnCard = page.locator('.pgn-bar');
      const [setupBox, pgnBox] = await Promise.all([setupCard.boundingBox(), pgnCard.boundingBox()]);
      if (view.width >= 1100) {
        expect(Math.abs(setupBox.y - pgnBox.y), `${theme} ${view.width}: setup top edges`).toBeLessThanOrEqual(2);
        expect(Math.abs(setupBox.height - pgnBox.height), `${theme} ${view.width}: setup card heights`).toBeLessThanOrEqual(2);
        expect(pgnBox.x).toBeGreaterThan(setupBox.x + setupBox.width - 2);
      } else {
        expect(pgnBox.y).toBeGreaterThan(setupBox.y + setupBox.height - 2);
      }
      await page.screenshot({ path: `${output}/layout-${theme}-${view.width}x${view.height}-setup.png`, fullPage: true, animations: 'disabled' });

      await page.getByRole('button', { name: 'Start two-player game' }).click();
      await expect(page.locator('.board-wrap')).toBeVisible();
      const board = await page.locator('.board-card').boundingBox();
      const moves = page.locator('.moves-panel');
      const controls = page.locator('.action-card');
      const movesBox = await moves.boundingBox();
      const controlsBox = await controls.boundingBox();
      await noHorizontalOverflow(page, view.width);
      await expect(page.locator('.evaluation-card .game-message-card')).toHaveAttribute('aria-live', 'polite');
      await expect(page.locator('.board-column > .game-message-card')).toHaveCount(0);

      if (view.width >= 1400) {
        expect(Math.abs(movesBox.y - controlsBox.y), `${theme} ${view.width}: control top edges`).toBeLessThanOrEqual(2);
        expect(Math.abs(movesBox.height - controlsBox.height), `${theme} ${view.width}: control heights`).toBeLessThanOrEqual(2);
        expect(controlsBox.x).toBeGreaterThan(movesBox.x + movesBox.width - 2);
      } else if (view.width >= 1024) {
        expect(controlsBox.y).toBeGreaterThan(movesBox.y + movesBox.height - 2);
        const buttons = await page.locator('.action-card .hint-button, .action-card .action-grid .button').evaluateAll((els) => els.map((el) => {
          const box = el.getBoundingClientRect();
          return { x: box.x, y: box.y, width: box.width, height: box.height };
        }));
        expect(buttons.length).toBeGreaterThanOrEqual(4);
        expect(Math.max(...buttons.map((item) => item.y)) - Math.min(...buttons.map((item) => item.y))).toBeLessThanOrEqual(2);
        expect(Math.max(...buttons.map((item) => item.width)) - Math.min(...buttons.map((item) => item.width))).toBeLessThanOrEqual(2);
      } else {
        expect(controlsBox.y).toBeGreaterThanOrEqual(board.y + board.height - 2);
        expect(await page.locator('.board-column').evaluate((el) => el.compareDocumentPosition(document.querySelector('.moves-panel')) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
      }
      if (view.width < 1024) expect(board.y).toBeLessThan(movesBox.y);
      await page.screenshot({ path: `${output}/layout-${theme}-${view.width}x${view.height}-game.png`, fullPage: true, animations: 'disabled' });
    }
  }
});
