import { test, expect } from './fixtures.js';

const pgn = '[Event "Live Chess"]\n[White "TestPlayer"]\n[Black "Opponent"]\n[Result "1-0"]\n[ECO "C50"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d3 Bc5 5. c3 d6 6. O-O O-O 7. Re1 a6 8. Bb3 Ba7 9. Nbd2 h6 10. Nf1 Be6 11. Ng3 Qd7 12. Be3 Bxe3 13. Rxe3 Rad8 14. d4 exd4 15. cxd4 Bg4 16. h3 Bxf3 17. Rxf3 Nxd4 18. Rd3 1-0';

test('save, edit, export, import and delete a local report lesson', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class MockReportWorker {
      constructor(url, options) { this.native = url.includes('stockfish-19-single.js') ? null : new NativeWorker(url, options); }
      postMessage(message) {
        if (String(message).startsWith('position fen ')) this.fen = String(message).slice('position fen '.length);
        if (this.native) return this.native.postMessage(message);
        if (message === 'uci') queueMicrotask(() => { this.onmessage?.({ data: 'id name Stockfish Lesson Test' }); this.onmessage?.({ data: 'uciok' }); });
        else if (message === 'isready') queueMicrotask(() => this.onmessage?.({ data: 'readyok' }));
        else if (String(message).startsWith('go depth')) {
          const best = this.fen?.split(' ')[1] === 'b' ? 'e7e5' : 'g1f3';
          queueMicrotask(() => { this.onmessage?.({ data: 'info depth 10 score cp 20 nodes 100 pv ' + best }); this.onmessage?.({ data: 'bestmove ' + best }); });
        }
      }
      terminate() { this.native?.terminate(); }
    };
  });
  const now = Math.floor(Date.now() / 1000);
  await page.route('**/api/chesscom/games?*', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('type') === 'archives') return route.fulfill({ json: { archives: [`https://api.chess.com/pub/player/testplayer/games/${new Date().getUTCFullYear()}/${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`] } });
    return route.fulfill({ json: { games: [1, 2].map((id) => ({ url: `https://www.chess.com/game/live/lesson-${id}`, rules: 'chess', pgn, end_time: now - id, time_class: 'blitz', white: { username: 'TestPlayer' }, black: { username: `Opponent${id}` } })) } });
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/#report');
  await page.getByLabel('Chess.com username').fill('TestPlayer');
  await page.getByRole('button', { name: 'Import games' }).click();
  await expect(page.locator('.report-tree-node').first()).toBeVisible({ timeout: 30_000 });
  await page.locator('.report-tree-node').first().click();
  await page.getByRole('complementary', { name: 'Selected position details' }).getByRole('button', { name: 'Save as lesson' }).click();
  const editor = page.getByRole('dialog', { name: 'Save as lesson' });
  await expect(editor).toBeVisible();
  await editor.getByLabel('My note').fill('Check the center first.');
  await editor.getByRole('button', { name: 'Save lesson' }).click();
  await expect(page.getByRole('heading', { name: 'Saved lessons (1/15)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Practice this' })).toHaveCount(0);
  const downloadWait = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export lessons' }).click();
  const download = await downloadWait;
  const stream = await download.createReadStream(); const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  await page.locator('input[type="file"]').setInputFiles({ name: download.suggestedFilename(), mimeType: 'application/json', buffer: Buffer.concat(chunks) });
  await expect(page.getByRole('heading', { name: 'Saved lessons (2/15)' })).toBeVisible();

  const savedLesson = page.locator('.report-saved-lesson').first();
  await savedLesson.getByRole('button', { name: 'Edit note' }).click();
  await savedLesson.getByLabel('My note').fill('Look for forcing moves before taking material.');
  await savedLesson.getByRole('button', { name: 'Save note' }).click();
  await expect(savedLesson).toContainText('Look for forcing moves');
  await savedLesson.getByRole('button', { name: 'Delete', exact: true }).click();
  await savedLesson.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(page.getByRole('heading', { name: 'Saved lessons (1/15)' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
});
