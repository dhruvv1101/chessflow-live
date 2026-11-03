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

export function gamePhase(fen, ply) {
  const chess = new Chess(fen);
  const pieces = chess.board().flat().filter((piece) => piece && piece.type !== 'k');
  const material = pieces.reduce((sum, piece) => sum + ({ q: 9, r: 5, b: 3, n: 3, p: 1 }[piece.type] || 0), 0);
  const queens = pieces.filter((piece) => piece.type === 'q').length;
  if (material <= 13 || queens === 0) return 'endgame';
  if (ply <= 20) return 'opening';
  return 'middlegame';
}

export function timeContext(clock) {
  if (clock == null || clock === '') return 'unknown';
  const match = String(clock).trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d+))?$/);
  if (!match) return 'unknown';
  const seconds = Number(match[1] || 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(`0.${match[4] || 0}`);
  if (seconds <= 30) return 'time trouble';
  if (seconds <= 120) return 'rushed';
  return 'had plenty of time';
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
