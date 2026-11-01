import { Chess } from 'chess.js';
import { createClient } from '@supabase/supabase-js';

const MAX_BODY_BYTES = 16 * 1024;
const GEMINI_TIMEOUT_MS = 15_000;
const REQUESTS_PER_MINUTE = 12;
const REQUESTS_PER_DAY = 120;
const DEFAULT_ORIGIN = 'https://chessflow-live.vercel.app';
const MOVE_TOKEN = /(?<![A-Za-z0-9])(?:O-O-O|O-O|(?:[KQRBN][a-h]?[1-8]?|[a-h]?[1-8]?)x?[a-h][1-8](?:=[QRBN])?[+#]?)(?![A-Za-z0-9])/g;
const UCI_TOKEN = /(?<![a-h][1-8])\b[a-h][1-8][a-h][1-8][qrbn]?\b(?![a-h][1-8])/g;
const fields = new Set([
  'fen', 'previous_fen', 'move_san', 'move_uci', 'best_uci', 'evaluation_before', 'evaluation_after',
  'evaluation_loss', 'variations', 'punishment_variations', 'opponent_response', 'side_to_move',
  'game_phase', 'motifs', 'user_level', 'practice',
]);
const lineFields = new Set(['uci', 'san', 'evaluation_cp_white', 'evaluation_mate_white', 'depth', 'nodes']);
const explanationFields = [
  'what_happened', 'why_bad', 'opponent_punishment', 'position_deterioration', 'punishment_line',
  'tactical_idea', 'winning_plan', 'lesson', 'elo_tip',
];

function response(res, status, body) {
  res.setHeader?.('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || DEFAULT_ORIGIN).split(',').map((item) => item.trim()).filter(Boolean);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateFen(fen) {
  if (typeof fen !== 'string' || fen.length > 100) throw new Error('invalid_fen');
  try { return new Chess(fen); } catch { throw new Error('invalid_fen'); }
}

function uciMove(uci) {
  if (typeof uci !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) throw new Error('invalid_move');
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci[4] ? { promotion: uci[4] } : {}) };
}

function validateLine(line, fen, allowedSans) {
  if (!isRecord(line) || Object.keys(line).some((key) => !lineFields.has(key))) throw new Error('invalid_line');
  if (!Array.isArray(line.uci) || !Array.isArray(line.san) || line.uci.length !== line.san.length || line.uci.length > 10) throw new Error('invalid_line');
  const game = new Chess(fen);
  for (let index = 0; index < line.uci.length; index += 1) {
    const move = game.move(uciMove(line.uci[index]));
    if (!move || move.san !== line.san[index]) throw new Error('illegal_line');
    allowedSans.add(move.san);
    allowedSans.add(line.uci[index]);
  }
  for (const key of ['evaluation_cp_white', 'evaluation_mate_white', 'depth', 'nodes']) {
    if (line[key] != null && (!Number.isSafeInteger(line[key]) || (key === 'depth' || key === 'nodes') && line[key] < 0)) throw new Error('invalid_line');
  }
}

function validateRequest(body) {
  if (!isRecord(body) || Object.keys(body).some((key) => !fields.has(key))) throw new Error('unknown_fields');
  const previous = validateFen(body.previous_fen);
  const after = validateFen(body.fen);
  if (body.side_to_move !== previous.turn()) throw new Error('invalid_side');
  if (typeof body.move_san !== 'string' || typeof body.move_uci !== 'string' || typeof body.best_uci !== 'string') throw new Error('invalid_move');
  const allowedSans = new Set();
  const played = previous.move(uciMove(body.move_uci));
  if (!played || played.san !== body.move_san || previous.fen() !== body.fen) throw new Error('illegal_move');
  allowedSans.add(played.san);
  allowedSans.add(body.move_uci);
  const bestBoard = new Chess(body.previous_fen);
  if (!bestBoard.move(uciMove(body.best_uci))) throw new Error('illegal_best_move');
  const bestSan = bestBoard.history().at(-1);
  allowedSans.add(bestSan);
  allowedSans.add(body.best_uci);
  if (!Array.isArray(body.variations) || body.variations.length < 1 || body.variations.length > 3) throw new Error('invalid_lines');
  if (!Array.isArray(body.punishment_variations) || body.punishment_variations.length > 3) throw new Error('invalid_lines');
  body.variations.forEach((line) => validateLine(line, body.previous_fen, allowedSans));
  body.punishment_variations.forEach((line) => validateLine(line, body.fen, allowedSans));
  if (body.opponent_response) {
    const responseBoard = new Chess(body.fen);
    const responseMove = responseBoard.move(uciMove(body.opponent_response));
    if (!responseMove) throw new Error('illegal_response');
    allowedSans.add(responseMove.san);
    allowedSans.add(body.opponent_response);
  }
  if (!Number.isSafeInteger(body.evaluation_loss) || body.evaluation_loss < 0 || body.evaluation_loss > 200_000) throw new Error('invalid_evaluation');
  for (const key of ['evaluation_before', 'evaluation_after']) {
    if (body[key] != null && (!Number.isSafeInteger(body[key]) || Math.abs(body[key]) > 200_000)) throw new Error('invalid_evaluation');
  }
  if (body.motifs !== undefined && (!Array.isArray(body.motifs) || body.motifs.length > 8 || body.motifs.some((motif) => typeof motif !== 'string' || motif.length > 50))) throw new Error('invalid_motifs');
  if (body.user_level !== undefined && !['beginner', 'intermediate', 'advanced', 'Easy', 'Medium', 'Hard', 'Max'].includes(body.user_level)) throw new Error('invalid_user_level');
  if (body.practice !== undefined && typeof body.practice !== 'boolean') throw new Error('invalid_practice_context');
  return { body, allowedSans, bestSan, playedSan: played.san };
}

function fallback(body, reason = 'gemini_unavailable') {
  const line = body.punishment_variations?.[0]?.san || [];
  return {
    provider: 'stockfish', model: null, fallback: true, flags: [reason],
    explanation: {
      what_happened: `You played ${body.move_san}. Stockfish evaluated the resulting position at ${body.evaluation_after ?? 'an unavailable score'} centipawns from White's perspective.`,
      why_bad: body.evaluation_loss > 0 ? `The move gave up ${body.evaluation_loss} centipawns compared with Stockfish's best move, ${body.best_uci}.` : `Stockfish found no evaluation loss for this move.`,
      opponent_punishment: line[0] ? `The supplied Stockfish continuation starts with ${line[0]}.` : 'No opponent continuation was supplied.',
      position_deterioration: line.length ? `The verified engine line is ${line.join(' ')}.` : 'No verified continuation was supplied.',
      punishment_line: line,
      tactical_idea: body.motifs?.length ? `Stockfish evidence includes: ${body.motifs.join(', ')}.` : 'No tactical motif was supplied by the engine analysis.',
      winning_plan: 'Review the supplied principal variations before choosing a plan.',
      lesson: 'Compare your move with the engine’s best move and look for forcing replies.',
      elo_tip: 'Before moving, check every legal capture, check and direct threat.',
    },
  };
}

function parseGeminiResult(payload) {
  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
  if (!text) throw new Error('invalid_gemini_response');
  const parsed = JSON.parse(text);
  if (!isRecord(parsed) || Object.keys(parsed).some((key) => !explanationFields.includes(key))) throw new Error('invalid_gemini_json');
  const normalized = {};
  for (const key of explanationFields) {
    const value = parsed[key];
    if (key === 'punishment_line') {
      if (value !== undefined && (!Array.isArray(value) || value.length > 10 || value.some((move) => typeof move !== 'string'))) throw new Error('invalid_gemini_json');
      normalized[key] = value || [];
    } else {
      if (typeof value !== 'string' || value.length > 1200) throw new Error('invalid_gemini_json');
      normalized[key] = value;
    }
  }
  return normalized;
}

function sanitizeExplanation(explanation, allowedSans, verifiedPunishment) {
  let removed = false;
  const sanitize = (value) => value.split(/(?<=[.!?])\s+/).filter((sentence) => {
    const matches = [...sentence.matchAll(MOVE_TOKEN), ...sentence.matchAll(UCI_TOKEN)].map((match) => match[0]);
    if (matches.some((move) => !allowedSans.has(move))) { removed = true; return false; }
    return true;
  }).join(' ').trim();
  const safe = Object.fromEntries(explanationFields.map((key) => [key, key === 'punishment_line' ? verifiedPunishment : sanitize(explanation[key])]));
  return { explanation: safe, flags: removed ? ['unverified_move_claim_removed'] : [] };
}

function getIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  return (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket?.remoteAddress || 'unknown').slice(0, 80);
}

export function createCoachHandler({ env = process.env, fetchImpl = globalThis.fetch, createClient: makeSupabaseClient = createClient, now = Date.now, counters = new Map() } = {}) {
  return async function coachHandler(req, res) {
    const origin = req.headers?.origin;
    const allowed = allowedOrigins(env);
    if (!origin || !allowed.includes(origin)) return response(res, 403, { error: 'origin_not_allowed' });
    res.setHeader?.('Access-Control-Allow-Origin', origin);
    res.setHeader?.('Vary', 'Origin');
    if (req.method !== 'POST') { res.setHeader?.('Allow', 'POST'); return response(res, 405, { error: 'method_not_allowed' }); }
    let body = req.body;
    if (typeof body === 'string') {
      if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) return response(res, 413, { error: 'body_too_large' });
      try { body = JSON.parse(body); } catch { return response(res, 400, { error: 'invalid_json' }); }
    }
    let byteLength;
    try { byteLength = Buffer.byteLength(JSON.stringify(body), 'utf8'); } catch { byteLength = MAX_BODY_BYTES + 1; }
    if (byteLength > MAX_BODY_BYTES) return response(res, 413, { error: 'body_too_large' });
    const stamp = now();
    const ip = getIp(req);
    const today = new Date(stamp).toISOString().slice(0, 10);
    const state = counters.get(ip) || { minute: [], day: today, daily: 0 };
    if (state.day !== today) { state.day = today; state.daily = 0; }
    const minute = state.minute.filter((time) => stamp - time < 60_000);
    if (minute.length >= REQUESTS_PER_MINUTE || state.daily >= REQUESTS_PER_DAY) return response(res, 429, { error: 'rate_limit_exceeded' });
    state.minute = [...minute, stamp];
    state.daily += 1;
    counters.set(ip, state);
    if (counters.size > 5000) {
      for (const [knownIp, entry] of counters) if (stamp - (entry.minute.at(-1) || 0) > 86_400_000) counters.delete(knownIp);
    }

    if (env.COACH_REQUIRE_LOGIN === 'true') {
      const token = /^Bearer\s+(.+)$/i.exec(req.headers?.authorization || '')?.[1];
      if (!token) return response(res, 401, { error: 'login_required' });
      if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) return response(res, 503, { error: 'login_verification_unavailable' });
      try {
        const supabase = makeSupabaseClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data?.user?.id) return response(res, 401, { error: 'login_required' });
      } catch { return response(res, 401, { error: 'login_required' }); }
    }

    let validated;
    try { validated = validateRequest(body); }
    catch (error) {
      const reason = error.message === 'unknown_fields' ? 'unknown_fields' : 'invalid_chess_facts';
      return response(res, 400, { error: reason });
    }
    if (!env.GEMINI_API_KEY) return response(res, 200, fallback(body, 'gemini_not_configured'));

    const prompt = [
      'Explain this chess move for the stated player level using ONLY the supplied Stockfish facts.',
      'Do not add, alter, or infer chess moves or variations. Tactical claims must be supported by the supplied motifs or legal engine lines.',
      'Return JSON only with keys: what_happened, why_bad, opponent_punishment, position_deterioration, punishment_line, tactical_idea, winning_plan, lesson, elo_tip.',
      'punishment_line must copy a prefix of a supplied punishment line exactly; if none exists, return an empty array.',
      'Each text field must be concise. Avoid SAN/UCI notation except for moves copied exactly from supplied facts.',
      `Validated facts: ${JSON.stringify({ ...body, best_san: validated.bestSan, played_san: validated.playedSan })}`,
    ].join('\n');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    try {
      const model = (env.GEMINI_MODEL || 'gemini-3.5-flash-lite').replace(/[^a-zA-Z0-9._-]/g, '');
      if (!model) throw new Error('invalid_model');
      const upstream = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 900,
            responseFormat: { text: { mimeType: 'APPLICATION_JSON', schema: {
              type: 'OBJECT', required: explanationFields,
              properties: {
                what_happened: { type: 'STRING' }, why_bad: { type: 'STRING' }, opponent_punishment: { type: 'STRING' },
                position_deterioration: { type: 'STRING' }, punishment_line: { type: 'ARRAY', items: { type: 'STRING' } },
                tactical_idea: { type: 'STRING' }, winning_plan: { type: 'STRING' }, lesson: { type: 'STRING' }, elo_tip: { type: 'STRING' },
              },
            } } },
          },
        }),
      });
      if (!upstream.ok) return response(res, 200, fallback(body, upstream.status === 429 ? 'gemini_quota_exhausted' : 'gemini_request_failed'));
      const explanation = parseGeminiResult(await upstream.json());
      const sanitized = sanitizeExplanation(explanation, validated.allowedSans, body.punishment_variations[0]?.san || []);
      return response(res, 200, { provider: 'gemini', model, fallback: false, ...sanitized });
    } catch {
      return response(res, 200, fallback(body, controller.signal.aborted ? 'gemini_timeout' : 'gemini_unavailable'));
    } finally { clearTimeout(timer); }
  };
}

export const config = { api: { bodyParser: { sizeLimit: '16kb' } } };
export default createCoachHandler();
