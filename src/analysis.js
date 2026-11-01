import { Chess } from 'chess.js';

export const DEFAULT_CLASSIFICATION_THRESHOLDS = Object.freeze({
  best: 10,
  excellent: 30,
  good: 60,
  inaccuracy: 100,
  mistake: 200,
});

export function buildTimeline(initialFen, sans) {
  const game = new Chess(initialFen || undefined);
  const fens = [game.fen()];
  const moves = [];
  for (const [index, san] of sans.entries()) {
    let move;
    try { move = game.move(san); }
    catch { move = null; }
    if (!move) throw new Error(`Could not replay move ${index + 1}: ${san}`);
    moves.push({ ply: index + 1, san: move.san, uci: `${move.from}${move.to}${move.promotion || ''}`,
      from: move.from, to: move.to, color: move.color, piece: move.piece, captured: move.captured || null,
      promotion: move.promotion || null });
    fens.push(game.fen());
  }
  return {
    initialFen: fens[0], fens, moves,
    positionAt(ply) {
      if (!Number.isInteger(ply) || ply < 0 || ply >= fens.length) throw new RangeError('Position index is outside this game.');
      return new Chess(fens[ply]);
    },
  };
}

export function scoreToWhiteCp(score) {
  if (!score) return 0;
  if (score.cp != null && Number.isFinite(score.cp)) return score.cp;
  if (score.mate != null && Number.isFinite(score.mate)) return Math.sign(score.mate || 1) * 100_000;
  return 0;
}

export function calculateEvaluationLoss(bestWhiteCp, playedWhiteCp, mover) {
  const difference = mover === 'b' ? playedWhiteCp - bestWhiteCp : bestWhiteCp - playedWhiteCp;
  return Math.max(0, Math.round(difference));
}

export function classifyMove({ lossCp, thresholds = DEFAULT_CLASSIFICATION_THRESHOLDS, book = false, brilliant = false } = {}) {
  if (book) return 'Book';
  if (!Number.isFinite(lossCp)) return 'Unrated';
  if (brilliant && lossCp <= thresholds.best) return 'Brilliant';
  if (lossCp <= thresholds.best) return 'Best';
  if (lossCp <= thresholds.excellent) return 'Excellent';
  if (lossCp <= thresholds.good) return 'Good';
  if (lossCp <= thresholds.inaccuracy) return 'Inaccuracy';
  if (lossCp <= thresholds.mistake) return 'Mistake';
  return 'Blunder';
}

export function legalVariation(fen, uciMoves, maxPlies = 10) {
  const game = new Chess(fen);
  const san = [];
  const uci = [];
  for (const token of (uciMoves || []).slice(0, maxPlies)) {
    if (typeof token !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(token)) break;
    try {
      const move = game.move({ from: token.slice(0, 2), to: token.slice(2, 4), ...(token[4] ? { promotion: token[4] } : {}) });
      san.push(move.san);
      uci.push(token);
    } catch { break; }
  }
  return { san, uci };
}
