import { Chess } from 'chess.js';
import { FREE_LIMITS } from './config.js';

export function normalizeAnalysisFen(fen) {
  const normalized = String(fen || '').trim().split(/\s+/).join(' ');
  if (normalized.split(' ').length !== 6) throw new TypeError('Analysis requires a complete FEN.');
  return normalized;
}

export function playerScore(whiteScore, userColor) {
  const sign = userColor === 'white' ? 1 : -1;
  return {
    cp: whiteScore?.cp == null ? null : whiteScore.cp * sign,
    mate: whiteScore?.mate == null ? null : whiteScore.mate * sign,
  };
}

export function winProbability(whiteScore, userColor) {
  const score = playerScore(whiteScore, userColor);
  if (score.mate != null) return score.mate > 0 ? 1 : 0;
  return 1 / (1 + (10 ** (-(score.cp || 0) / 400)));
}

export function classifyMoveLoss(loss, thresholds = FREE_LIMITS.lossThresholds) {
  if (!Number.isFinite(loss) || loss < thresholds.inaccuracy) return 'Good';
  if (loss >= thresholds.blunder) return 'Blunder';
  if (loss >= thresholds.mistake) return 'Mistake';
  return 'Inaccuracy';
}

export function gamePhase(fen, ply, thresholds = FREE_LIMITS.phaseThresholds) {
  const chess = new Chess(fen);
  const pieces = chess.board().flat().filter((piece) => piece && piece.type !== 'k');
  const material = pieces.reduce((sum, piece) => sum + ({ q: 9, r: 5, b: 3, n: 3, p: 1 }[piece.type] || 0), 0);
  const queens = pieces.filter((piece) => piece.type === 'q').length;
  const fullmove = Number(fen.split(/\s+/)[5]) || Math.ceil(ply / 2);

  // Material distinguishes a genuinely reduced ending from an early queen
  // trade: no queens alone is not enough to call a position an endgame.
  if (queens === 0 && material <= thresholds.endgameMaterialNoQueens) return 'endgame';
  if (material <= thresholds.endgameMaterialAnyQueen) return 'endgame';

  // Call it an opening only while the position remains materially close to
  // the starting army; move number by itself never determines the phase.
  if (fullmove <= thresholds.openingMaxFullmove && material >= thresholds.openingMinMaterial) return 'opening';
  return 'middlegame';
}

export function parseClockSeconds(clock) {
  if (clock == null || clock === '') return null;
  const match = String(clock).trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d+))?$/);
  if (!match) return null;
  return Number(match[1] || 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(`0.${match[4] || 0}`);
}

export function timeContext({ spentSeconds, remainingSeconds, averageSpentSeconds } = {}, thresholds = FREE_LIMITS.timeContext) {
  if (!Number.isFinite(remainingSeconds) || remainingSeconds < 0) return { label: 'unknown', confidence: null };
  if (remainingSeconds <= thresholds.lowClockSeconds) return { label: 'low clock', confidence: 'likely' };
  if (!Number.isFinite(spentSeconds) || spentSeconds < 0) return { label: 'unknown', confidence: null };
  if (spentSeconds <= thresholds.instantMoveMaxSeconds) return { label: 'instant move', confidence: 'likely' };
  const longRelativeToClock = spentSeconds >= remainingSeconds * thresholds.longThinkClockRatio;
  const longRelativeToAverage = Number.isFinite(averageSpentSeconds) && averageSpentSeconds > 0
    && spentSeconds >= averageSpentSeconds * thresholds.longThinkAverageMultiplier;
  if (spentSeconds >= thresholds.longThinkMinSeconds || longRelativeToClock || longRelativeToAverage) {
    return { label: 'long think', confidence: 'likely' };
  }
  return { label: 'unknown', confidence: null };
}

export function hasLostAdvantage(beforeScore, afterScore, thresholds = FREE_LIMITS.lostAdvantage) {
  if (beforeScore?.mate > 0 && (afterScore?.mate == null || afterScore.mate <= 0)) return true;
  if (beforeScore?.cp == null || beforeScore.cp < thresholds.minimumBeforeCp) return false;
  if (afterScore?.mate < 0) return true;
  return afterScore?.cp != null && beforeScore.cp - afterScore.cp >= thresholds.minimumDropCp;
}

function chessMoveFromUci(fen, uci) {
  if (!uci || typeof uci !== 'string' || uci.length < 4) return null;
  const chess = new Chess(fen);
  try { return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }); } catch { return null; }
}

export function likelyTactic({ beforeFen, afterFen, bestMoveUci, opponentResponseUci, beforePlayerScore }) {
  if (beforePlayerScore?.mate > 0) return { kind: 'missed_mate', confidence: 'likely', basis: 'engine_mate_line' };
  const bestMove = chessMoveFromUci(beforeFen, bestMoveUci);
  if (bestMove?.isCapture()) return { kind: 'missed_capture', confidence: 'likely', basis: 'engine_best_move' };
  const response = chessMoveFromUci(afterFen, opponentResponseUci);
  if (response?.isCapture()) return { kind: 'hung_piece', confidence: 'likely', basis: 'engine_reply_capture' };
  if (/[+#]$/.test(response?.san || '')) return { kind: 'missed_opponent_threat', confidence: 'likely', basis: 'engine_reply_check' };
  return { kind: 'missed_opponent_threat', confidence: 'likely', basis: 'engine_evaluation_drop' };
}
