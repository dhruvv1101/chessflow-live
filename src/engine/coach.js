const configuredApiUrl = (import.meta.env.VITE_ENGINE_API_URL || '').replace(/\/+$/, '');
const COACH_CACHE = 'chessflow-live.coach-cache.v1';

export function coachCacheKey(review, engineVersion, analysisSettings) {
  return JSON.stringify([review.fen, review.previousFen, review.moveUci, engineVersion, analysisSettings]);
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

export async function analyzeCoachMove(review, { apiUrl = configuredApiUrl, fetchImpl = globalThis.fetch, signal } = {}) {
  if (!apiUrl) throw new Error('Coach server is not configured. Stockfish analysis is still available.');
  let response;
  try {
    response = await fetchImpl(`${apiUrl}/api/coach/analyze`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({
        fen: review.fen, previous_fen: review.previousFen, move_san: review.moveSan,
        move_uci: review.moveUci, best_uci: review.bestUci,
        evaluation_before: review.evaluationBefore, evaluation_after: review.evaluationAfter,
        evaluation_loss: review.evaluationLoss, variations: review.variations,
        punishment_variations: review.punishmentVariations,
        opponent_response: review.opponentResponse, side_to_move: review.sideToMove,
        game_phase: review.gamePhase, motifs: review.motifs || [],
      }),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error(`Coach service unavailable: ${error.message}`);
  }
  if (!response.ok) {
    if (response.status === 503) throw new Error('Coach service unavailable. Stockfish analysis is still available.');
    throw new Error(`Coach service returned ${response.status}. Stockfish analysis is still available.`);
  }
  const body = await response.json();
  if (!body?.explanation || typeof body.explanation.what_happened !== 'string') throw new Error('Coach service returned an invalid explanation.');
  return body;
}
