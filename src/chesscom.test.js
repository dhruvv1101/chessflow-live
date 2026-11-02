import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChessComClient, clearChessComMemoryCache, enrichChessComGame, filterChessComGames, parseChessComUsername, resultFromMyView } from './chesscom.js';

afterEach(() => { clearChessComMemoryCache(); sessionStorage.clear(); vi.restoreAllMocks(); });

function response(data, { status = 200, headers = {} } = {}) {
  const map = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]));
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  return { ok: status >= 200 && status < 300, status, headers: { get: (key) => map.get(key.toLowerCase()) || null }, text: async () => body };
}

const standardGame = (overrides = {}) => ({ rules: 'chess', pgn: '[White "Dhruv"]\n[Black "Other"]\n[Result "1-0"]\n\n1. e4 e5 1-0', url: 'https://www.chess.com/game/live/1', end_time: 1_800_000_000, time_class: 'blitz', white: { username: 'Dhruv', rating: 1400, result: 'win' }, black: { username: 'Other', rating: 1500, result: 'checkmated' }, accuracies: { white: 83, black: 61 }, ...overrides });

describe('Chess.com public game client', () => {
  it('accepts conservative usernames and extracts member profile URLs', () => {
    expect(parseChessComUsername('Test_Player-1')).toBe('Test_Player-1');
    expect(parseChessComUsername('https://www.chess.com/member/Test_Player')).toBe('Test_Player');
    expect(() => parseChessComUsername('https://chess.com/member/name/more')).toThrow(/valid Chess.com username/);
    expect(() => parseChessComUsername('a')).toThrow();
    expect(() => parseChessComUsername('name<script>')).toThrow();
  });

  it('detects colour and result from the requested user perspective', () => {
    expect(enrichChessComGame(standardGame(), 'dHrUv')).toMatchObject({ color: 'white', opponentName: 'Other', myResult: 'win', accuracy: 83, moveCount: 2 });
    expect(resultFromMyView(standardGame(), 'black')).toBe('loss');
    expect(resultFromMyView(standardGame({ white: { username: 'Dhruv', result: 'agreed' }, black: { username: 'Other', result: 'agreed' } }), 'white')).toBe('draw');
  });

  it('counts Chess.com PGNs with clock comments and extra headers', () => {
    const game = standardGame({ pgn: '[Event "Live Chess"]\n[TimeControl "600+0"]\n[UTCDate "2026.11.02"]\n[White "Dhruv"]\n[Black "Other"]\n[Result "1-0"]\n\n1. e4 {[%clk 0:09:58.1]} e5 {[%clk 0:09:58.2]} 1-0' });
    expect(enrichChessComGame(game, 'Dhruv').moveCount).toBe(2);
  });

  it('filters by time class, colour, result, month, and opponent text', () => {
    const games = [enrichChessComGame(standardGame(), 'Dhruv'), enrichChessComGame(standardGame({ archiveMonth: '2025/02', time_class: 'rapid', white: { username: 'Other', result: 'win' }, black: { username: 'Dhruv', result: 'checkmated' } }), 'Dhruv')];
    games[0].archiveMonth = '2025/03';
    expect(filterChessComGames(games, { timeClass: 'blitz', color: 'white', result: 'win', month: '2025/03', opponent: 'oth' })).toHaveLength(1);
    expect(filterChessComGames(games, { opponent: 'missing' })).toHaveLength(0);
  });

  it('fetches newest archives then months strictly serially and skips variants', async () => {
    const order = [];
    const fetchImpl = vi.fn(async (url) => {
      order.push(url);
      if (url.includes('archives')) return response({ archives: ['https://api.chess.com/pub/player/User/games/2025/02', 'https://api.chess.com/pub/player/User/games/2025/01'] });
      return response({ games: [standardGame({ end_time: 1_800_000_000 }), standardGame({ end_time: 1_800_000_100 }), standardGame({ rules: 'chess960' })] });
    });
    const client = new ChessComClient({ fetchImpl });
    const [archives, month] = await Promise.all([client.getArchives('User'), client.getMonth('User', 2025, 2)]);
    expect(archives[0]).toContain('/2025/02');
    expect(month.games).toHaveLength(2);
    expect(month.games[0].end_time).toBe(1_800_000_100);
    expect(month.skippedVariants).toBe(1);
    expect(order).toHaveLength(2);
    expect(order[0]).toContain('type=archives');
    expect(order[1]).toContain('year=2025');
  });

  it('honours Retry-After within a bounded retry count and maps common status errors', async () => {
    const wait = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi.fn().mockResolvedValueOnce(response({}, { status: 429, headers: { 'retry-after': '3' } })).mockResolvedValueOnce(response({ archives: [] }));
    const client = new ChessComClient({ fetchImpl, wait });
    await expect(client.getArchives('User')).resolves.toEqual([]);
    expect(wait).toHaveBeenCalledWith(3000);
    const dateDelay = vi.fn().mockResolvedValue(undefined);
    const retryDate = new Date(Date.now() + 5000).toUTCString();
    await new ChessComClient({ fetchImpl: vi.fn().mockResolvedValueOnce(response({}, { status: 429, headers: { 'retry-after': retryDate } })).mockResolvedValueOnce(response({ archives: [] })), wait: dateDelay }).getArchives('UserDate');
    expect(dateDelay.mock.calls[0][0]).toBeGreaterThan(0);
    let waitingStarted;
    const started = new Promise((resolve) => { waitingStarted = resolve; });
    const controller = new AbortController();
    const cancelledClient = new ChessComClient({ fetchImpl: vi.fn().mockResolvedValue(response({}, { status: 429, headers: { 'retry-after': '30' } })), wait: async () => { waitingStarted(); return new Promise(() => {}); } });
    const cancelled = cancelledClient.getArchives('CancelMe', { signal: controller.signal });
    await started;
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    for (const [status, message] of [[404, /not found/], [429, /rate limiting/], [403, /blocked/]]) {
      await expect(new ChessComClient({ fetchImpl: vi.fn().mockResolvedValue(response({}, { status })), retries: 0 }).getArchives(`User${status}`)).rejects.toThrow(message);
    }
  });

  it('uses ETag and returns a cached immutable month on 304', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(response({ games: [standardGame()] }, { headers: { etag: 'month-etag' } })).mockResolvedValueOnce(response('', { status: 304 }));
    const client = new ChessComClient({ fetchImpl });
    const first = await client.getMonth('User', 2025, 2);
    clearChessComMemoryCache();
    const second = await client.getMonth('User', 2025, 2);
    expect(second.games).toHaveLength(1);
    expect(fetchImpl.mock.calls[1][1].headers['If-None-Match']).toBe('month-etag');
    expect(first.games[0].archiveMonth).toBe('2025/02');
  });

  it('reports malformed payloads, times out, and can be cancelled', async () => {
    await expect(new ChessComClient({ fetchImpl: vi.fn().mockResolvedValue(response('{not json')) }).getArchives('User')).rejects.toThrow(/malformed data/);
    const timeoutFetch = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })));
    await expect(new ChessComClient({ fetchImpl: timeoutFetch, timeoutMs: 1 }).getArchives('User')).rejects.toThrow(/timed out/);
    const controller = new AbortController(); controller.abort();
    await expect(new ChessComClient({ fetchImpl: vi.fn() }).getArchives('User', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
