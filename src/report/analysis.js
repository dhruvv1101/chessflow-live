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

export function timeContext({ spentSeconds, remainingSeconds, averageSpentSeconds, baseTimeSeconds, timeClass } = {}, thresholds = FREE_LIMITS.timeContext) {
  if (!Number.isFinite(remainingSeconds) || remainingSeconds < 0) return { label: 'unknown', confidence: null };
  if (!Number.isFinite(spentSeconds) || spentSeconds < 0) return { label: 'unknown', confidence: null };
  const normalizedClass = String(timeClass || '').toLowerCase();
  const inferredClass = normalizedClass === 'bullet' || normalizedClass === 'blitz' || normalizedClass === 'rapid'
    ? normalizedClass
    : Number.isFinite(baseTimeSeconds) ? (baseTimeSeconds <= 180 ? 'bullet' : baseTimeSeconds <= 600 ? 'blitz' : 'rapid') : 'default';
  const classThresholds = thresholds.byClass[inferredClass] || thresholds.byClass.default;
  const instantLimit = Number.isFinite(baseTimeSeconds)
    ? Math.min(classThresholds.instantMoveMaxSeconds, baseTimeSeconds * thresholds.instantMoveBaseRatio)
    : classThresholds.instantMoveMaxSeconds;
  const lowClockLimit = Number.isFinite(baseTimeSeconds) && classThresholds.lowClockRatio != null
    ? Math.max(classThresholds.lowClockMinSeconds, Math.min(classThresholds.lowClockMaxSeconds, baseTimeSeconds * classThresholds.lowClockRatio))
    : classThresholds.lowClockSeconds;
  const longThinkLimit = Number.isFinite(baseTimeSeconds) && classThresholds.longThinkBaseRatio != null
    ? Math.max(classThresholds.longThinkMinSeconds, baseTimeSeconds * classThresholds.longThinkBaseRatio)
    : classThresholds.longThinkMinSeconds;
  if (remainingSeconds <= lowClockLimit) return { label: 'low clock', confidence: 'likely' };
  if (spentSeconds <= instantLimit) return { label: 'instant move', confidence: 'likely' };
  const longRelativeToClock = spentSeconds >= remainingSeconds * thresholds.longThinkClockRatio;
  const longRelativeToAverage = Number.isFinite(averageSpentSeconds) && averageSpentSeconds > 0
    && spentSeconds >= averageSpentSeconds * thresholds.longThinkAverageMultiplier;
  if (spentSeconds >= longThinkLimit || longRelativeToClock || longRelativeToAverage) {
    return { label: 'long think', confidence: 'likely' };
  }
  return { label: 'normal pace', confidence: 'likely' };
}

export function hasLostAdvantage(beforeScore, afterScore, thresholds = FREE_LIMITS.lostAdvantage) {
  const beforeWinProbability = winProbabilityFromPlayerScore(beforeScore);
  const afterWinProbability = winProbabilityFromPlayerScore(afterScore);
  if (beforeScore?.mate > 0 && (afterScore?.mate <= 0 || afterWinProbability < thresholds.maximumAfterWinProbability)) return true;
  return beforeWinProbability >= thresholds.minimumBeforeWinProbability
    && afterWinProbability < thresholds.maximumAfterWinProbability;
}

function winProbabilityFromPlayerScore(score) {
  if (score?.mate != null) return score.mate > 0 ? 1 : 0;
  return 1 / (1 + (10 ** (-(score?.cp || 0) / 400)));
}

export function compareMoveLoss({ playedUci, bestMoveUci, beforeWhiteScore, afterWhiteScore, moverColor, marginCp = FREE_LIMITS.bestMoveMarginCp }) {
  const before = playerScore(beforeWhiteScore, moverColor);
  const after = playerScore(afterWhiteScore, moverColor);
  const exactBestMove = Boolean(bestMoveUci && String(playedUci).toLowerCase() === String(bestMoveUci).toLowerCase());
  const rawCpDrop = before.cp == null || after.cp == null || before.mate != null || after.mate != null
    ? null : Math.max(0, before.cp - after.cp);
  const bestOrWithinMargin = exactBestMove || (rawCpDrop != null && rawCpDrop <= marginCp);
  if (bestOrWithinMargin) return { lossCp: 0, winProbabilityLoss: 0, bestOrWithinMargin, effectiveAfterScore: before };

  if (rawCpDrop != null) {
    const lossCp = Math.max(0, rawCpDrop - marginCp);
    const effectiveAfterScore = { cp: before.cp - lossCp, mate: null };
    return {
      lossCp,
      winProbabilityLoss: Math.max(0, winProbabilityFromPlayerScore(before) - winProbabilityFromPlayerScore(effectiveAfterScore)),
      bestOrWithinMargin: false,
      effectiveAfterScore,
    };
  }

  return {
    lossCp: null,
    winProbabilityLoss: Math.max(0, winProbabilityFromPlayerScore(before) - winProbabilityFromPlayerScore(after)),
    bestOrWithinMargin: false,
    effectiveAfterScore: after,
  };
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

function materialBalance(fen, color) {
  const chess = new Chess(fen);
  const values = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  return chess.board().flat().reduce((balance, piece) => {
    if (!piece || piece.type === 'k') return balance;
    return balance + values[piece.type] * (piece.color === color ? 1 : -1);
  }, 0);
}

function isMaterialWinningCapture(afterFen, responseUci, pvUci = []) {
  const chess = new Chess(afterFen);
  const opponentColor = chess.turn();
  const beforeBalance = materialBalance(afterFen, opponentColor);
  const response = chessMoveFromUci(afterFen, responseUci);
  if (!response?.isCapture()) return false;
  chess.move({ from: response.from, to: response.to, promotion: response.promotion });
  const line = pvUci[0]?.toLowerCase() === responseUci?.toLowerCase() ? pvUci.slice(1) : [];
  if (line[0]) {
    try { chess.move({ from: line[0].slice(0, 2), to: line[0].slice(2, 4), promotion: line[0][4] }); } catch { /* a short line still supports an immediate capture tag */ }
  }
  return materialBalance(chess.fen(), opponentColor) > beforeBalance;
}

export function captureTags({ beforeFen, afterFen, playedUci, bestMoveUci, opponentResponseUci, opponentResponsePvUci = [], lossCp }) {
  if (!Number.isFinite(lossCp) || lossCp <= 0) return [];
  const tags = [];
  const playedMove = chessMoveFromUci(beforeFen, playedUci);
  const bestMove = chessMoveFromUci(beforeFen, bestMoveUci);
  if (playedMove?.isCapture()) tags.push({
    kind: 'played-capture-lost-value', confidence: 'likely',
    description: 'The played move is a capture and the engine marks it as a mistake or worse.',
  });
  if (bestMove?.isCapture() && playedUci?.toLowerCase() !== bestMoveUci?.toLowerCase()) tags.push({
    kind: 'missed-capture', confidence: 'likely',
    description: 'The engine’s best move is a legal capture, but a different move was played.',
  });
  if (isMaterialWinningCapture(afterFen, opponentResponseUci, opponentResponsePvUci)) tags.push({
    kind: 'allowed-capture-hung-piece', confidence: 'likely',
    description: 'The engine’s best reply captures material and remains ahead after its next principal-variation move.',
  });
  return tags;
}
