import { describe, expect, it, vi } from 'vitest';
import { buildRecentGameSet, parseReportUsername, parseReportPgn } from './chesscom.js';
import { createReportChessComClient } from './client.js';

const pgn = `[Event "Live Chess"]\n[White "TestPlayer"]\n[Black "Opponent"]\n[Result "1-0"]\n[ECO "C20"]\n[Opening "King's Pawn Game"]\n\n1. e4 {[%clk 0:09:59.2]} e5 {[%clk 0:09:58.1]} 2. Nf3 1-0`;

describe('report Chess.com import', () => {
  it('validates usernames using the report import format', () => {
    expect(parseReportUsername('Test_Player')).toBe('Test_Player');
    expect(() => parseReportUsername('ab')).toThrow(/valid Chess.com username/i);
    expect(() => parseReportUsername('test/name')).toThrow(/valid Chess.com username/i);
  });

  it('parses PGN headers, user color, result, opening and per-move clocks', () => {
    const parsed = parseReportPgn({ url: 'https://chess.com/game/1', pgn, rules: 'chess', time_class: 'blitz', white: { username: 'TestPlayer' }, black: { username: 'Opponent' }, end_time: 1_800_000_000 }, 'testplayer');
    expect(parsed).toMatchObject({ userColor: 'white', result: '1-0', timeClass: 'blitz', eco: 'C20', opening: "King's Pawn Game" });
    expect(parsed.headers.White).toBe('TestPlayer');
    expect(parsed.moves.map((move) => move.clock)).toEqual(['0:09:59.2', '0:09:58.1', null]);
    expect(parsed.moves[0]).toMatchObject({ san: 'e4', uci: 'e2e4', ply: 1 });
  });

  it('keeps the 25 newest standard games and reports every dropped reason', () => {
    const game = (id, end_time, rules = 'chess') => ({ url: `https://chess.com/game/${id}`, pgn, rules, time_class: 'rapid', white: { username: 'TestPlayer' }, black: { username: 'Opponent' }, end_time });
    const old = Math.floor(Date.UTC(2012, 0, 1) / 1000);
    const input = [game('a', old), game('a', old), game('old', old - 1), game('variant', old, 'chess960'), { ...game('invalid', old), pgn: 'not a pgn' }, { ...game('missing', old), url: '' }, ...Array.from({ length: 30 }, (_, index) => game(`new-${index}`, old - 2 - index))];
    const result = buildRecentGameSet(input, 'TestPlayer', { limits: { maxGames: 25 } });
    expect(result.games).toHaveLength(25);
    expect(new Set(result.games.map((entry) => entry.url)).size).toBe(25);
    expect(result.games[0].endTime).toBeGreaterThanOrEqual(result.games.at(-1).endTime);
    expect(result.skippedVariants).toBe(1);
    expect(result.dropped).toEqual({ variants: 1, invalidPgn: 1, missingMetadata: 1, duplicates: 1, overLimit: 7 });
  });
});

describe('report Chess.com client', () => {
  it('fetches archive months serially, backs off on 429, and reuses ETag cache on 304', async () => {
    const calls = [];
    let monthOneAttempts = 0;
    let monthTenAttempts = 0;
    const fetchImpl = vi.fn(async (url, options) => {
      calls.push(url);
      if (url.includes('type=archives')) return new Response(JSON.stringify({ archives: ['https://api.chess.com/pub/player/test/games/2026/11', 'https://api.chess.com/pub/player/test/games/2026/10'] }), { headers: { etag: 'archives-v1' } });
      if (url.includes('month=11') && ++monthOneAttempts === 1) return new Response(JSON.stringify({ error: 'rate limited' }), { status: 429, headers: { 'retry-after': '0' } });
      if (url.includes('month=11')) return new Response(JSON.stringify({ games: [] }), { headers: { etag: 'nov-v1' } });
      if (url.includes('month=10') && ++monthTenAttempts === 1) return new Response(JSON.stringify({ games: [] }), { headers: { etag: 'oct-v1' } });
      return new Response(null, { status: 304, headers: { etag: 'oct-v1' } });
    });
    const client = createReportChessComClient({ fetchImpl, sleep: async () => {} });
    await client.getMonth('test', 2026, 10);
    calls.length = 0;
    const imported = await client.importRecentGames('test', { maxGames: 25 });
    expect(imported.games).toEqual([]);
    expect(imported).toMatchObject({ archiveMonthsFound: 2, archiveMonthsFetched: 2, gamesFetched: 0 });
    expect(imported.dropped).toEqual({ variants: 0, invalidPgn: 0, missingMetadata: 0, duplicates: 0, overLimit: 0 });
    expect(calls.map((url) => url.match(/month=\d+/)?.[0] || 'archives')).toEqual(['archives', 'month=11', 'month=11', 'month=10']);
    const octoberRequest = fetchImpl.mock.calls.at(-1)[1];
    expect(octoberRequest.headers['If-None-Match']).toBe('oct-v1');
  });

  it('fetches newest archive months until it has the 25 most recent games, including old games', async () => {
    const archiveMonths = ['2026/11', '2026/10', '2026/09', '2026/08'];
    const monthGames = new Map(archiveMonths.map((month, monthIndex) => [month, Array.from({ length: 10 }, (_, index) => {
      const time = Date.UTC(2016, 11 - monthIndex, 10, 12, 9 - index);
      const end_time = Math.floor(time / 1000);
      return { url: `https://chess.com/game/${month}-${index}`, end_time, pgn, rules: 'chess', white: { username: 'TestPlayer' }, black: { username: 'Opponent' } };
    })]));
    const fetchedMonths = [];
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes('type=archives')) return new Response(JSON.stringify({ archives: archiveMonths.map((month) => `https://api.chess.com/pub/player/test/games/${month}`) }));
      const query = new URLSearchParams(url.split('?')[1]);
      const month = `${query.get('year')}/${query.get('month')}`;
      fetchedMonths.push(month);
      return new Response(JSON.stringify({ games: monthGames.get(month) }));
    });
    const client = createReportChessComClient({ fetchImpl });
    const result = await client.importRecentGames('test', { maxGames: 25 });

    expect(result.games).toHaveLength(25);
    expect(result.games.map((game) => game.url)).toEqual([...monthGames.values()].flat().slice(0, 25).map((game) => game.url));
    expect(fetchedMonths).toEqual(archiveMonths.slice(0, 3));
    expect(result).toMatchObject({ archiveMonthsFound: 4, archiveMonthsFetched: 3, gamesFetched: 30 });
    expect(result.dropped.overLimit).toBe(5);
  });

  it('returns all available games when the player only has older archives', async () => {
    const oldGame = { url: 'https://chess.com/game/old', end_time: Math.floor(Date.UTC(2010, 0, 1) / 1000), pgn, rules: 'chess', white: { username: 'TestPlayer' }, black: { username: 'Opponent' } };
    const fetchImpl = vi.fn(async (url) => url.includes('type=archives')
      ? new Response(JSON.stringify({ archives: ['https://api.chess.com/pub/player/test/games/2010/01'] }))
      : new Response(JSON.stringify({ games: [oldGame] })));
    const client = createReportChessComClient({ fetchImpl });
    const result = await client.importRecentGames('test');

    expect(result.games.map((game) => game.url)).toEqual([oldGame.url]);
    expect(result.archiveMonthsFound).toBe(1);
    expect(result.archiveMonthsFetched).toBe(1);
  });

  it('maps missing users, rate limits and offline failures to plain messages', async () => {
    const notFound = createReportChessComClient({ fetchImpl: async () => new Response('{}', { status: 404 }) });
    await expect(notFound.getArchives('test')).rejects.toThrow(/user not found/i);

    const fetch429 = vi.fn(async () => new Response('{}', { status: 429, headers: { 'retry-after': '0' } }));
    const limited = createReportChessComClient({ fetchImpl: fetch429, sleep: async () => {}, retries: 2 });
    await expect(limited.getArchives('test')).rejects.toThrow(/rate limiting/i);
    expect(fetch429).toHaveBeenCalledTimes(3);

    const offline = createReportChessComClient({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
    await expect(offline.getArchives('test')).rejects.toThrow(/Could not reach Chess\.com/i);
  });

  it('explains which deployment setting is missing when the proxy returns 503', async () => {
    const unconfigured = createReportChessComClient({
      fetchImpl: async () => new Response(JSON.stringify({ error: 'service_not_configured' }), { status: 503 }),
    });
    await expect(unconfigured.getArchives('test')).rejects.toThrow(/CHESSCOM_CONTACT.*deployment.*redeploy/i);
  });
});
