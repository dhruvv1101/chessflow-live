import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeCoachMove, coachCacheKey } from './coach.js';

afterEach(() => vi.unstubAllGlobals());

const review = { fen: 'after', previousFen: 'before', moveSan: 'Qh5', moveUci: 'd1h5', bestUci: 'e2e4',
  evaluationBefore: 25, evaluationAfter: -120, evaluationLoss: 145,
  variations: [{ uci: ['e2e4', 'e7e5'], san: ['e4', 'e5'] }],
  punishmentVariations: [{ uci: ['e7e5', 'g1f3'], san: ['e5', 'Nf3'] }], opponentResponse: 'e7e5', motifs: [] };

describe('coach API client', () => {
  it('sends structured engine evidence to the configured server and parses JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ explanation: { what_happened: 'A queen move lost time.' }, model: 'gemini' }) });
    const result = await analyzeCoachMove(review, { apiUrl: 'https://server.example', fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith('https://server.example/api/coach/analyze', expect.objectContaining({ method: 'POST' }));
    expect(result.explanation.what_happened).toContain('queen');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({ fen: 'after', move_uci: 'd1h5', best_uci: 'e2e4' });
  });

  it('fails clearly when coach hosting is absent and surfaces server failures', async () => {
    await expect(analyzeCoachMove(review, { apiUrl: '', fetchImpl: vi.fn() })).rejects.toThrow(/not configured/i);
    await expect(analyzeCoachMove(review, { apiUrl: 'https://server.example', fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 503 }) })).rejects.toThrow(/unavailable/i);
  });

  it('uses a stable content key so repeated move explanations can be cached', () => {
    expect(coachCacheKey(review, 'Stockfish 19', { movetime: 1500 })).toBe(coachCacheKey(review, 'Stockfish 19', { movetime: 1500 }));
    expect(coachCacheKey(review, 'Stockfish 19', { movetime: 1500 })).not.toBe(coachCacheKey({ ...review, moveUci: 'g1f3' }, 'Stockfish 19', { movetime: 1500 }));
  });
});
