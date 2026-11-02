import { supabase } from '../cloud/supabase.js';

const configuredApiUrl = import.meta.env.VITE_COACH_URL || '/api/coach';
const COACH_CACHE = 'chessflow-live.coach-cache.v1';

function endpointFor(value) {
  const url = String(value || '/api/coach').replace(/\/+$/, '');
  if (url.endsWith('/api/coach') || url.endsWith('/api/coach/analyze')) return url;
  return `${url}/api/coach/analyze`;
}

function stockfishFallback(review, message = '') {
  const line = review.punishmentVariations?.[0]?.san || [];
  return {
    provider: 'stockfish', model: null, fallback: true, flags: ['coach_api_unavailable'], message,
    explanation: {
      what_happened: `You played ${review.moveSan}. Stockfish evaluated the position after your move.`,
      why_bad: review.evaluationLoss > 0 ? `The move gave up ${review.evaluationLoss} centipawns compared with ${review.bestSan || review.bestUci}.` : 'Stockfish found no evaluation loss for this move.',
      opponent_punishment: line[0] ? `The verified Stockfish line starts with ${line[0]}.` : 'No punishment line was supplied.',
      position_deterioration: line.length ? `The engine line is ${line.join(' ')}.` : 'No verified continuation is available.',
      punishment_line: line,
      tactical_idea: review.motifs?.length ? `Engine facts include ${review.motifs.join(', ')}.` : 'No tactical motif was supplied by Stockfish.',
      winning_plan: 'Review the displayed engine lines for a concrete plan.',
      lesson: 'Compare your move with the engine’s best move and check forcing replies.',
      elo_tip: 'Before moving, scan for every check, capture and direct threat.',
    },
  };
}

async function defaultAccessToken() {
  if (!supabase) return null;
  try { return (await supabase.auth.getSession()).data.session?.access_token || null; } catch { return null; }
}

export function coachCacheKey(review, engineVersion, analysisSettings) {
  return JSON.stringify([review.fen, review.previousFen, review.moveUci, review.userLevel, review.practice === true, engineVersion, analysisSettings]);
}

export function getCachedCoachExplanation(key, storage = globalThis.localStorage) {
  try { return JSON.parse(storage?.getItem(COACH_CACHE) || '{}')[key] || null; } catch { return null; }
}

export function cacheCoachExplanation(key, explanation, storage = globalThis.localStorage) {
  try {
    const cache = JSON.parse(storage?.getItem(COACH_CACHE) || '{}');
    const entries = Object.entries({ ...cache, [key]: explanation }).slice(-100);
    storage?.setItem(COACH_CACHE, JSON.stringify(Object.fromEntries(entries)));
  } catch { /* caching is optional */ }
}

export async function analyzeCoachMove(review, { apiUrl = configuredApiUrl, fetchImpl = globalThis.fetch, signal, getAccessToken = defaultAccessToken } = {}) {
  if (review.practice !== undefined && typeof review.practice !== 'boolean') throw new TypeError('Invalid practice context.');
  let token = null;
  try { token = await getAccessToken(); } catch { /* login is optional unless the server requires it */ }
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetchImpl(endpointFor(apiUrl), {
      method: 'POST', headers, signal,
      body: JSON.stringify({
        fen: review.fen, previous_fen: review.previousFen, move_san: review.moveSan,
        move_uci: review.moveUci, best_uci: review.bestUci,
        evaluation_before: review.evaluationBefore, evaluation_after: review.evaluationAfter,
        evaluation_loss: review.evaluationLoss, variations: review.variations,
        punishment_variations: review.punishmentVariations,
        opponent_response: review.opponentResponse, side_to_move: review.sideToMove,
        game_phase: review.gamePhase, motifs: review.motifs || [], user_level: review.userLevel || 'intermediate',
        ...(review.practice === true ? { practice: true } : {}),
      }),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    return stockfishFallback(review, 'Coach service is unavailable. Stockfish analysis is still available.');
  }
  let body;
  try { body = await response.json(); } catch { return stockfishFallback(review, 'Coach service returned an unreadable response. Stockfish analysis is still available.'); }
  if (!response.ok) {
    if (body?.error === 'login_required') return { ...stockfishFallback(review), loginRequired: true, message: 'Sign in to use the AI coach' };
    return stockfishFallback(review, 'Coach service is unavailable. Stockfish analysis is still available.');
  }
  if (!body?.explanation || typeof body.explanation.what_happened !== 'string') return stockfishFallback(review, 'Coach service returned an invalid explanation. Stockfish analysis is still available.');
  if (!body.provider) body.provider = 'gemini';
  return body;
}
