// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createReportChessComHandler } from './games.js';

function request({ method = 'GET', url = '/api/chesscom/games?username=Test_User&type=archives', headers = {}, fetchImpl } = {}) {
  const req = { method, url, headers: { origin: 'https://chessflow-live.vercel.app', ...headers }, socket: { remoteAddress: '127.0.0.1' } };
  const res = { headers: {}, status(code) { this.statusCode = code; return this; }, setHeader(name, value) { this.headers[name] = value; }, json(body) { this.body = body; return this; }, end() { return this; } };
  return createReportChessComHandler({ env: { CHESSCOM_CONTACT: 'test@example.invalid' }, fetchImpl: fetchImpl || vi.fn().mockResolvedValue(new Response(JSON.stringify({ archives: [] }), { headers: { etag: 'a1' } })), counters: new Map() })(req, res).then(() => res);
}

describe('report Chess.com proxy', () => {
  it('allows only GET archive requests for valid usernames and sends contact plus cache headers', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ archives: [] }), { headers: { etag: 'a1' } }));
    const result = await request({ fetchImpl });
    expect(result.statusCode).toBe(200);
    expect(result.headers['Cache-Control']).toContain('s-maxage=43200');
    expect(fetchImpl.mock.calls[0][1].headers['User-Agent']).toContain('test@example.invalid');
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.chess.com/pub/player/Test_User/games/archives');
    expect((await request({ url: '/api/chesscom/games?username=bad%2Fuser&type=archives' })).statusCode).toBe(400);
    expect((await request({ method: 'POST' })).statusCode).toBe(405);
    expect((await request({ headers: { origin: 'https://evil.example' } })).statusCode).toBe(403);
  });

  it('forwards ETags, upstream status and Retry-After', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 429, headers: { 'retry-after': '3' } }));
    const result = await request({ fetchImpl, headers: { 'if-none-match': 'etag-old' } });
    expect(result.statusCode).toBe(429);
    expect(result.headers['Retry-After']).toBe('3');
    expect(fetchImpl.mock.calls[0][1].headers['If-None-Match']).toBe('etag-old');
  });
});
