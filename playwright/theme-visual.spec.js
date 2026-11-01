import { expect, test } from '@playwright/test';

const output = 'docs/screenshots';
const views = [
  { name: '390x844', width: 390, height: 844 },
  { name: '1280x800', width: 1280, height: 800 },
];
const analysisResponse = {
  best_uci: 'e2e4', engine: 'Stockfish 19', depth: 18, nodes: 123456, time_ms: 37,
  lines: [{ rank: 1, uci: 'e2e4', san: 'e4', pv_uci: ['e2e4', 'e7e5'], pv_san: ['e4', 'e5'], cp_white: 32, mate_white: null }],
};

async function screenshot(page, theme, view, state) {
  await page.screenshot({ path: `${output}/${theme}-${state}-${view.name}.png`, animations: 'disabled' });
}

async function chooseTheme(page, theme) {
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByLabel('Theme').selectOption(theme);
  await expect(page.locator('html')).toHaveAttribute('data-effective-theme', theme);
  return dialog;
}

test('captures dark and light app states at phone and desktop sizes', async ({ page }) => {
  await page.route('**/health', (route) => route.fulfill({ json: { ok: true, engine: 'Stockfish 19', threads: 2, hash_mb: 128 } }));
  await page.route('**/analyze', (route) => route.fulfill({ json: analysisResponse }));

  for (const view of views) {
    await page.setViewportSize({ width: view.width, height: view.height });
    for (const theme of ['light', 'dark']) {
      await page.goto('/');
      const settings = await chooseTheme(page, theme);
      await settings.getByRole('button', { name: 'Close settings' }).click();
      await screenshot(page, theme, view, 'home');

      await page.locator('.local-setup-card').scrollIntoViewIfNeeded();
      await screenshot(page, theme, view, 'two-player-setup');

      await page.getByRole('button', { name: 'Settings' }).click();
      await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
      await screenshot(page, theme, view, 'settings');
      await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Close settings' }).click();

      await page.getByRole('button', { name: 'Start two-player game' }).click();
      await page.locator('[data-square="e2"]').click();
      await page.locator('[data-square="e4"]').click();
      await expect(page.locator('.count-badge')).toHaveText('1 ply');
      await page.locator('.board-column').scrollIntoViewIfNeeded();
      await screenshot(page, theme, view, 'game');

      await page.goto('/');
      await page.getByRole('button', { name: 'Get a hint' }).click();
      await expect(page.locator('.engine-info')).toContainText('Server engine: Stockfish 19, depth 18');
      await page.locator('.analysis-panel').scrollIntoViewIfNeeded();
      await screenshot(page, theme, view, 'analysis-panel');
    }
  }
});

test('dark text and accent pairings meet WCAG AA contrast', async ({ page }) => {
  await page.goto('/');
  const settings = await chooseTheme(page, 'dark');
  const geometryTokens = await page.locator('html').evaluate((element) => {
    const style = getComputedStyle(element);
    return ['--border-width', '--card-radius', '--control-radius', '--card-shadow'].map((name) => style.getPropertyValue(name).trim());
  });
  expect(geometryTokens).toEqual(['1px', '20px', '17px', '0 8px 24px rgb(0 0 0 / 45%)']);
  const results = await page.evaluate(() => {
    const luminance = (color) => {
      const normalized = color.trim().startsWith('#')
        ? color.slice(1).match(/.{1,2}/g).map((channel) => Number.parseInt(channel.length === 1 ? channel.repeat(2) : channel, 16))
        : color.match(/[\d.]+/g).slice(0, 3).map(Number);
      const rgb = normalized.map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    };
    const ratio = (foreground, background) => {
      const [bright, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
      return Number(((bright + 0.05) / (dark + 0.05)).toFixed(2));
    };
    const style = getComputedStyle(document.documentElement);
    const token = (name) => style.getPropertyValue(name).trim();
    const darkText = token('--bg');
    const pairs = [
      ['body text', token('--text'), token('--bg')],
      ['muted text on cards', token('--muted'), token('--surface')],
      ['yellow action', darkText, token('--yellow')],
      ['green icon tile', darkText, token('--green')],
      ['lime icon tile', darkText, token('--lime')],
      ['amber icon tile', darkText, token('--amber')],
      ['pink icon tile', darkText, token('--pink')],
      ['purple icon tile', token('--text'), token('--purple')],
      ['neutral on page', token('--neutral'), token('--bg')],
      ['coordinates on light squares', '#000000', token('--board-light')],
      ['coordinates on dark squares', token('--white-fill'), token('--board-purple')],
    ];
    const tokenResults = pairs.map(([name, foreground, background]) => ({ name, foreground, background, ratio: ratio(foreground, background) }));
    const samples = [
      ['yellow action', 'button button-yellow'],
      ['green icon', 'icon-box icon-green'],
      ['lime icon', 'icon-box icon-lime'],
      ['amber icon', 'icon-box icon-peach'],
      ['pink icon', 'icon-box icon-pink'],
      ['purple icon', 'icon-box icon-purple'],
      ['pink review badge', 'review-badge badge-pink'],
      ['amber review badge', 'review-badge badge-peach'],
      ['yellow review badge', 'review-badge badge-yellow'],
      ['green status glyph', 'ready engine-status-icon'],
    ];
    const elementResults = samples.map(([name, classes]) => {
      const element = document.createElement(classes.includes('button') ? 'button' : 'span');
      let host = element;
      if (classes.includes('engine-status-icon')) {
        host = document.createElement('span');
        host.className = 'engine-pill ready';
        element.className = 'engine-status-icon';
        host.append(element);
      } else element.className = classes;
      document.body.append(host);
      const computed = getComputedStyle(element);
      const result = { name, foreground: computed.color, background: computed.backgroundColor, ratio: ratio(computed.color, computed.backgroundColor) };
      host.remove();
      return result;
    });
    return [...tokenResults, ...elementResults];
  });
  for (const pair of results) expect(pair.ratio, `${pair.name}: ${pair.foreground} on ${pair.background}`).toBeGreaterThanOrEqual(4.5);
  console.log('Dark theme AA contrast:', JSON.stringify(results));
  await settings.getByRole('button', { name: 'Close settings' }).click();
});

test('dark board keeps both piece colors distinct on both square colors', async ({ page }) => {
  await page.goto('/');
  const settings = await chooseTheme(page, 'dark');
  await settings.getByRole('button', { name: 'Close settings' }).click();
  const styles = await page.evaluate(() => ({
    lightSquare: getComputedStyle(document.querySelector('[data-square="b1"]')).backgroundColor,
    darkSquare: getComputedStyle(document.querySelector('[data-square="a1"]')).backgroundColor,
    whitePiece: getComputedStyle(document.querySelector('#chessboard-piece-wN-b1 g')).fill,
    whiteOutline: getComputedStyle(document.querySelector('#chessboard-piece-wN-b1 g')).stroke,
    blackPiece: getComputedStyle(document.querySelector('#chessboard-piece-bN-b8 g')).fill,
    blackOutline: getComputedStyle(document.querySelector('#chessboard-piece-bN-b8 g')).stroke,
  }));
  expect(styles).toMatchObject({
    lightSquare: 'rgb(216, 213, 240)', darkSquare: 'rgb(76, 53, 184)',
    whitePiece: 'rgb(255, 255, 255)', whiteOutline: 'rgb(52, 51, 77)',
    blackPiece: 'rgb(20, 18, 42)', blackOutline: 'rgb(233, 231, 255)',
  });
});
