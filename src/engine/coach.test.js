import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeCoachMove, coachCacheKey } from './coach.js';

afterEach(() => vi.unstubAllGlobals());

const review = { fen: 'after', previousFen: 'before', moveSan: 'Qh5', moveUci: 'd1h5', bestUci: 'e2e4',
  evaluationBefore: 25, evaluationAfter: -120, evaluationLoss: 145, userLevel: 'intermediate',
  variations: [{ uci: ['e2e4', 'e7e5'], san: ['e4', 'e5'], cp: 24 }],
  punishmentVariations: [{ uci: ['e7e5', 'g1f3'], san: ['e5', 'Nf3'] }], opponentResponse: 'e7e5', motifs: [] };
const goodResponse = { provider: 'gemini', model: 'gemini-3.5-flash-lite', fallback: false, flags: [], explanation: { what_happened: 'A queen move lost time.' } };

describe('coach API client', () => {
  it('uses the same-origin function by default and sends structured engine evidence', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => goodResponse });
    const result = await analyzeCoachMove(review, { fetchImpl, getAccessToken: async () => null });
    expect(fetchImpl).toHaveBeenCalledWith('/api/coach', expect.objectContaining({ method: 'POST' }));
    expect(result.provider).toBe('gemini');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({ fen: 'after', move_uci: 'd1h5', best_uci: 'e2e4', user_level: 'intermediate' });
  });

  it('adds the signed-in Supabase access token without sending it in the body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => goodResponse });
    await analyzeCoachMove(review, { apiUrl: '/api/coach', fetchImpl, getAccessToken: async () => 'access-token' });
    const [, request] = fetchImpl.mock.calls[0];
    expect(request.headers.Authorization).toBe('Bearer access-token');
    expect(request.body).not.toContain('access-token');
  });

  it('uses an explicit override and exposes the local Docker route convention', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => goodResponse });
    await analyzeCoachMove(review, { apiUrl: 'http://localhost:8090', fetchImpl, getAccessToken: async () => null });
    expect(fetchImpl.mock.calls[0][0]).toBe('http://localhost:8090/api/coach/analyze');
  });

  it('returns a labelled Stockfish-only explanation when the function is unavailable', async () => {
    const result = await analyzeCoachMove(review, { fetchImpl: vi.fn().mockRejectedValue(new Error('offline')), getAccessToken: async () => null });
    expect(result.provider).toBe('stockfish');
    expect(result.fallback).toBe(true);
    expect(result.explanation.why_bad).toContain('145');
  });

  it('clearly flags a login-required response while preserving Stockfish evidence', async () => {
    const result = await analyzeCoachMove(review, { fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'login_required' }) }), getAccessToken: async () => null });
    expect(result.provider).toBe('stockfish');
    expect(result.message).toMatch(/sign in/i);
    expect(result.loginRequired).toBe(true);
  });

  it('keeps aborts visible to the caller for stale-request cancellation', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    await expect(analyzeCoachMove(review, { fetchImpl: vi.fn().mockRejectedValue(abort), getAccessToken: async () => null })).rejects.toBe(abort);
  });

  it('uses a stable content key so repeated move explanations can be cached', () => {
    expect(coachCacheKey(review, 'Stockfish 19', { movetime: 1500 })).toBe(coachCacheKey(review, 'Stockfish 19', { movetime: 1500 }));
    expect(coachCacheKey(review, 'Stockfish 19', { movetime: 1500 })).not.toBe(coachCacheKey({ ...review, moveUci: 'g1f3' }, 'Stockfish 19', { movetime: 1500 }));
  });
});
