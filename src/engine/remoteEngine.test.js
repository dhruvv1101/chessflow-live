import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeRemote, resetRemoteHealthCache } from './remoteEngine.js';

const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1';
const reply = { best_uci: 'e7e5', engine: 'Stockfish 19', depth: 18, nodes: 1234, time_ms: 3000, lines: [
  { rank: 1, uci: 'e7e5', san: 'e5', pv_san: ['e5', 'Nf3'], pv_uci: ['e7e5', 'g1f3'], cp_white: 34, mate_white: null },
] };
const jsonResponse = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); resetRemoteHealthCache(); });

describe('remote hint engine', () => {
  it('checks server health, POSTs analysis, and converts White scores to side-to-move', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(jsonResponse({ ok: true, engine: 'Stockfish 19', threads: 2, hash_mb: 128 })).mockResolvedValueOnce(jsonResponse(reply));
    const result = await analyzeRemote(fen, { fetchImpl: fetch, apiUrl: 'https://engine.example', movetime: 2500, multipv: 3, positionId: 7 });
    expect(fetch.mock.calls[1][1].body).toContain('"skill":20');
    expect(result.best).toBe('e7e5');
    expect(result.lines[0]).toMatchObject({ cp: 34, sideCp: -34, pv: ['e7e5', 'g1f3'] });
    expect(result.engineInfo).toMatchObject({ source: 'Server engine', depth: 18, threads: 2, hashMb: 128 });
  });

  it('surfaces server 503 for the router fallback', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(jsonResponse({ ok: true, engine: 'SF', threads: 1, hash_mb: 32 })).mockResolvedValueOnce(jsonResponse({}, 503));
    await expect(analyzeRemote(fen, { fetchImpl: fetch, apiUrl: 'https://engine.example', positionId: 1 })).rejects.toMatchObject({ status: 503 });
  });

  it('times out fetch using movetime plus four seconds', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })));
    const pending = analyzeRemote(fen, { fetchImpl: fetch, apiUrl: 'https://engine.example', movetime: 100, positionId: 1 });
    const rejection = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(4100);
    await rejection;
  });

  it('discards a stale response after the position id changes', async () => {
    let id = 1;
    const fetch = vi.fn().mockResolvedValueOnce(jsonResponse({ ok: true, engine: 'SF', threads: 1, hash_mb: 32 })).mockResolvedValueOnce(jsonResponse(reply));
    id = 2;
    await expect(analyzeRemote(fen, { fetchImpl: fetch, apiUrl: 'https://engine.example', positionId: 1, getPositionId: () => id })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects invalid JSON and structurally invalid payloads', async () => {
    const badJson = vi.fn().mockResolvedValueOnce(jsonResponse({ ok: true, engine: 'SF', threads: 1, hash_mb: 32 })).mockResolvedValueOnce({ ok: true, json: async () => { throw new Error('bad json'); } });
    await expect(analyzeRemote(fen, { fetchImpl: badJson, apiUrl: 'https://engine.example', positionId: 1 })).rejects.toThrow(/invalid JSON/i);
    resetRemoteHealthCache();
    const incomplete = vi.fn().mockResolvedValueOnce(jsonResponse({ ok: true, engine: 'SF', threads: 1, hash_mb: 32 })).mockResolvedValueOnce(jsonResponse({ lines: [] }));
    await expect(analyzeRemote(fen, { fetchImpl: incomplete, apiUrl: 'https://engine.example', positionId: 1 })).rejects.toThrow(/incomplete/i);
  });
});
