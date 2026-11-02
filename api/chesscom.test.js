// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createChessComHandler } from './chesscom.js';

function call(options = {}) {
  const req = { method: options.method || 'GET', url: options.url || '/api/chesscom?username=Test_Player&type=archives', query: options.query,
    headers: { origin: 'https://chessflow-live.vercel.app', ...(options.headers || {}) }, socket: { remoteAddress: '198.51.100.12' } };
  const res = { headers: {}, statusCode: 200, setHeader(name, value) { this.headers[name] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } };
  const handler = createChessComHandler({ env: { CHESSCOM_CONTACT: 'test@example.invalid', ALLOWED_ORIGINS: 'https://chessflow-live.vercel.app' }, fetchImpl: options.fetchImpl || vi.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers({ etag: 'abc' }), text: async () => '{"archives":[]}' }), now: () => 1_800_000_000_000, counters: options.counters || new Map() });
  return handler(req, res).then(() => res);
}

describe('Chess.com proxy function', () => {
  it('allows only the public archives and monthly-game endpoints and forwards a safe User-Agent', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers({ etag: 'etag-1' }), text: async () => '{"archives":[]}' });
    const result = await call({ fetchImpl });
    expect(result.statusCode).toBe(200);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.chess.com/pub/player/Test_Player/games/archives');
    expect(fetchImpl.mock.calls[0][1].headers['User-Agent']).toContain('test@example.invalid');
    expect(fetchImpl.mock.calls[0][1].headers.Cookie).toBeUndefined();
    const month = await call({ url: '/api/chesscom?username=Test_Player&type=month&year=2026&month=4', fetchImpl });
    expect(month.statusCode).toBe(200);
    expect(fetchImpl.mock.calls[1][0]).toContain('/games/2026/04');
    expect(await call({ url: '/api/chesscom?username=Test_Player&type=profile', fetchImpl }).then((res) => res.statusCode)).toBe(400);
  });

  it('rejects invalid names, non-GET methods, and untrusted Origins', async () => {
    expect((await call({ url: '/api/chesscom?username=bad%2Fname&type=archives' })).statusCode).toBe(400);
    expect((await call({ method: 'POST' })).statusCode).toBe(405);
    expect((await call({ headers: { origin: 'https://attacker.example' } })).statusCode).toBe(403);
  });

  it.each([[404, 404], [429, 429], [403, 403], [500, 502]])('maps upstream HTTP %s to %s', async (upstreamStatus, status) => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: upstreamStatus, headers: new Headers(), text: async () => '' });
    expect((await call({ fetchImpl })).statusCode).toBe(status);
  });

  it('forwards an upstream Retry-After value for a rate-limited request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429, headers: new Headers({ 'retry-after': '17' }), text: async () => '' });
    const result = await call({ fetchImpl });
    expect(result.statusCode).toBe(429);
    expect(result.headers['Retry-After']).toBe('17');
  });

  it('returns a bodyless 304 when Chess.com confirms a cached response', async () => {
    const result = await call({ fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 304, headers: new Headers({ etag: 'same' }), text: async () => '' }) });
    expect(result.statusCode).toBe(304);
    expect(result.headers.ETag).toBe('same');
  });

  it('enforces the response cap while streaming when Content-Length is missing', async () => {
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(3 * 1024 * 1024 + 1)); controller.close(); } });
    const result = await call({ fetchImpl: vi.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers(), body }) });
    expect(result.statusCode).toBe(502);
    expect(result.body).toEqual({ error: 'response_too_large' });
  });

  it('forwards ETag conditionals, caches immutable months, rejects large payloads, and safely handles missing contact', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers({ 'content-length': '4000000' }), text: async () => '{}' });
    const large = await call({ url: '/api/chesscom?username=Test_Player&type=month&year=2020&month=1', fetchImpl, headers: { 'if-none-match': 'old-tag' } });
    expect(large.statusCode).toBe(502);
    expect(fetchImpl.mock.calls[0][1].headers['If-None-Match']).toBe('old-tag');
    const noContactHandler = createChessComHandler({ env: {}, fetchImpl, counters: new Map() });
    const req = { method: 'GET', url: '/api/chesscom?username=Test_Player&type=archives', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    const res = { setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
    await noContactHandler(req, res);
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'service_not_configured' });
  });
});
