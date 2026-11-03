import { test, expect } from './fixtures.js';

function monthUrl(date, offset = 0) {
  const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
  return `https://api.chess.com/pub/player/testplayer/games/${value.getUTCFullYear()}/${String(value.getUTCMonth() + 1).padStart(2, '0')}`;
}

const samplePgn = `[Event "Live Chess"]\n[White "TestPlayer"]\n[Black "Opponent"]\n[Result "1-0"]\n[ECO "C20"]\n\n1. e4 {[%clk 0:09:59]} e5 {[%clk 0:09:58]} 2. Nf3 Nc6 3. Bc4 1-0`;
const noMovePgn = `[Event "Live Chess"]\n[White "TestPlayer"]\n[Black "Opponent"]\n[Result "0-1"]\n[Termination "Opponent won by resignation"]\n\n0-1`;

test('opens and exits the report through the existing navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  const blackChoice = page.getByRole('button', { name: 'Black' });
  await blackChoice.click();
  await expect(blackChoice).toHaveClass(/is-selected/);
  await page.getByRole('link', { name: 'Report' }).click();
  await expect(page.getByRole('heading', { name: 'Game Report' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to ChessFlow Live' }).click();
  await expect(blackChoice).toHaveClass(/is-selected/);
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
});

test('imports public standard games locally and fits in both themes', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/api/chesscom/games?*', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('type') === 'archives') return route.fulfill({ json: { archives: [monthUrl(new Date()), monthUrl(new Date(), -1)] } });
    const current = new Date();
    if (Number(params.get('year')) !== current.getUTCFullYear() || Number(params.get('month')) !== current.getUTCMonth() + 1) return route.fulfill({ json: { games: [] } });
    return route.fulfill({ json: { games: [
      { url: 'https://www.chess.com/game/live/123', rules: 'chess', pgn: samplePgn, end_time: Math.floor(Date.now() / 1000), time_class: 'blitz', white: { username: 'TestPlayer' }, black: { username: 'Opponent' } },
      { url: 'https://www.chess.com/game/live/variant', rules: 'chess960', pgn: samplePgn, end_time: Math.floor(Date.now() / 1000), time_class: 'blitz', white: { username: 'TestPlayer' }, black: { username: 'Opponent' } },
      { url: 'https://www.chess.com/game/live/no-moves', rules: 'chess', pgn: noMovePgn, end_time: Math.floor(Date.now() / 1000) - 1, time_class: 'blitz', white: { username: 'TestPlayer' }, black: { username: 'Opponent' } },
    ] } });
  });

  for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width: 390, height: 844 });
    if (theme === 'light') {
      await page.addInitScript((themeValue) => localStorage.setItem('chessflow-live.settings.v1', JSON.stringify({ version: 1, settings: { theme: themeValue } })), theme);
    } else {
      await page.evaluate((themeValue) => {
        localStorage.setItem('chessflow-live.settings.v1', JSON.stringify({ version: 1, settings: { theme: themeValue } }));
        document.documentElement.dataset.theme = themeValue;
        document.documentElement.dataset.effectiveTheme = themeValue;
      }, theme);
    }
    await page.goto('/#report');
    await expect(page.getByRole('heading', { name: 'Game Report' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Filters' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Opening tree' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Leaks' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Games', exact: true })).toBeVisible();
    await expect(page.getByText('Your report starts here')).toBeVisible();
    await page.getByLabel('Chess.com username').fill('TestPlayer');
    await page.getByRole('button', { name: 'Import games' }).click();
    const importSummary = page.locator('.report-message[role="status"]');
    await expect(importSummary).toContainText('Imported 1 of up to 25 most recent standard games.');
    await expect(importSummary).toContainText('1 variant, 0 invalid PGNs, 1 game with no moves');
    await expect(importSummary).toContainText('0 short games with fewer than 3 moves by you');
    await page.getByText('Why some games were skipped (1 details)').click();
    await expect(page.getByText(/PGN has headers and a result but no moves.*Termination: Opponent won by resignation/)).toBeVisible();
    await expect(page.getByText('TestPlayer vs Opponent')).toBeVisible();
    await page.getByRole('button', { name: 'Black' }).click();
    await expect(page.locator('.report-games-section').getByText('No games match the current filters or selection.')).toBeVisible();
    await page.getByRole('button', { name: 'White' }).click();
    await expect(page.getByText('TestPlayer vs Opponent')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-effective-theme', theme);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
    await page.getByRole('button', { name: 'Delete my imported data' }).click();
    await expect(page.getByText('Your report starts here')).toBeVisible();
    await page.goto('/#top');
  }
  expect(errors).toEqual([]);
});
