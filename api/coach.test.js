// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createCoachHandler } from './coach.js';

const before = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const validBody = {
  fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
  previous_fen: before,
  move_san: 'e4',
  move_uci: 'e2e4',
  best_uci: 'e2e4',
  evaluation_before: 0,
  evaluation_after: 24,
  evaluation_loss: 0,
  variations: [{ uci: ['e2e4', 'e7e5'], san: ['e4', 'e5'], evaluation_cp_white: 24 }],
  punishment_variations: [{ uci: ['e7e5', 'g1f3'], san: ['e5', 'Nf3'], evaluation_cp_white: 24 }],
  opponent_response: 'e7e5',
  side_to_move: 'w',
  game_phase: 'opening',
  motifs: [],
  user_level: 'beginner',
};
const explanation = {
  what_happened: 'You played e4 and challenged the center.',
  why_bad: 'This move is sound in the supplied engine analysis.',
  opponent_punishment: 'Black can answer e5.',
  position_deterioration: 'The position remains balanced.',
  punishment_line: ['e5', 'Nf3'],
  tactical_idea: 'No forced tactic is present in the supplied lines.',
  winning_plan: 'Develop the pieces.',
  lesson: 'Control the center.',
  elo_tip: 'Review central pawn moves.',
};

function invoke(options = {}) {
  const headers = { origin: 'https://chessflow-live.vercel.app', 'content-type': 'application/json', ...options.headers };
  const req = { method: options.method || 'POST', headers, body: options.body === undefined ? validBody : options.body, socket: { remoteAddress: options.ip || '198.51.100.42' } };
  const res = {
    headers: {}, statusCode: 200,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
  const handler = createCoachHandler({
    env: { ALLOWED_ORIGINS: 'https://chessflow-live.vercel.app', GEMINI_API_KEY: 'test-only', GEMINI_MODEL: 'gemini-test', ...options.env },
    fetchImpl: options.fetchImpl || vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(explanation) }] } }] }) }),
    createClient: options.createClient,
    now: options.now || (() => 1_800_000_000_000),
    counters: options.counters || new Map(),
  });
  return handler(req, res).then(() => res);
}

describe('Vercel coach function', () => {
  it('uses validated Stockfish facts and returns a sanitized Gemini explanation', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(explanation) }] } }] }) });
    const result = await invoke({ fetchImpl });
    expect(result.statusCode).toBe(200);
    expect(result.body.provider).toBe('gemini');
    expect(result.body.explanation.what_happened).toContain('e4');
    expect(fetchImpl.mock.calls[0][0]).toContain('/models/gemini-test:generateContent');
    expect(fetchImpl.mock.calls[0][1].headers['x-goog-api-key']).toBe('test-only');
  });

  it.each([
    ['malformed JSON', async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{broken' }] } }] }) })],
    ['provider error', async () => ({ ok: false, status: 429 })],
  ])('falls back to Stockfish when Gemini returns %s', async (_name, response) => {
    const result = await invoke({ fetchImpl: vi.fn().mockResolvedValue(await response()) });
    expect(result.statusCode).toBe(200);
    expect(result.body.provider).toBe('stockfish');
    expect(result.body.fallback).toBe(true);
  });

  it('falls back on timeout and when the Gemini key is missing', async () => {
    const timeoutFetch = vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    const timedOut = await invoke({ fetchImpl: timeoutFetch });
    const missingKey = await invoke({ env: { GEMINI_API_KEY: '' } });
    expect(timedOut.body.provider).toBe('stockfish');
    expect(missingKey.body.provider).toBe('stockfish');
  });

  it('removes a sentence that claims an unprovided SAN move', async () => {
    const invented = { ...explanation, tactical_idea: 'Black can win with Qxh7+ immediately.' };
    const result = await invoke({ fetchImpl: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(invented) }] } }] }) }) });
    expect(result.body.provider).toBe('gemini');
    expect(result.body.explanation.tactical_idea).toBe('');
    expect(result.body.flags).toContain('unverified_move_claim_removed');
  });

  it.each([
    ['invalid FEN', { ...validBody, previous_fen: 'not a fen' }],
    ['illegal played move', { ...validBody, move_uci: 'e2e5' }],
    ['illegal line', { ...validBody, variations: [{ uci: ['e2e4', 'e7e4'], san: ['e4', 'Qxe4'] }] }],
  ])('rejects %s before calling Gemini', async (_name, body) => {
    const fetchImpl = vi.fn();
    const result = await invoke({ body, fetchImpl });
    expect(result.statusCode).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects oversized and unknown-field payloads', async () => {
    const large = { ...validBody, motifs: ['x'.repeat(17_000)] };
    const tooLarge = await invoke({ body: large });
    const unknown = await invoke({ body: { ...validBody, apiKey: 'never accepted' } });
    expect(tooLarge.statusCode).toBe(413);
    expect(unknown.statusCode).toBe(400);
  });

  it('rejects an Origin outside the configured allowlist', async () => {
    const result = await invoke({ headers: { origin: 'https://attacker.example' } });
    expect(result.statusCode).toBe(403);
  });

  it('requires a verified Supabase bearer token only when login is enabled', async () => {
    const createClient = vi.fn(() => ({ auth: { getUser: vi.fn(async (token) => ({ data: { user: token === 'valid-user-token' ? { id: 'user-1' } : null }, error: token === 'valid-user-token' ? null : new Error('invalid') })) } }));
    const missing = await invoke({ env: { COACH_REQUIRE_LOGIN: 'true', VITE_SUPABASE_URL: 'https://project.example', VITE_SUPABASE_ANON_KEY: 'anon-test' }, createClient });
    const valid = await invoke({ headers: { authorization: 'Bearer valid-user-token' }, env: { COACH_REQUIRE_LOGIN: 'true', VITE_SUPABASE_URL: 'https://project.example', VITE_SUPABASE_ANON_KEY: 'anon-test' }, createClient });
    expect(missing.statusCode).toBe(401);
    expect(missing.body.error).toBe('login_required');
    expect(valid.statusCode).toBe(200);
    expect(createClient).toHaveBeenCalledWith('https://project.example', 'anon-test', expect.any(Object));
  });

  it('accepts only POST', async () => {
    const result = await invoke({ method: 'GET' });
    expect(result.statusCode).toBe(405);
  });
});
