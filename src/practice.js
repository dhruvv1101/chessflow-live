export const PRACTICE_GOOD_LOSS_CP = 30;

function whiteScore(score = {}) {
  if (Number.isFinite(score.cp)) return score.cp;
  if (Number.isFinite(score.mate)) return Math.sign(score.mate || 1) * (200_000 - Math.abs(score.mate) * 100);
  return 0;
}

export function judgePracticeMove({ color, moveUci, bestUci, lines = [], bestScore, playedScore, goodLossCp = PRACTICE_GOOD_LOSS_CP }) {
  if (moveUci === bestUci || lines.some((line) => line.uci === moveUci)) return { accepted: true, kind: 'best', label: 'Best move!', lossCp: 0 };
  const best = whiteScore(bestScore);
  const played = whiteScore(playedScore);
  const lossCp = Math.max(0, Math.round(color === 'b' ? played - best : best - played));
  const bestForMover = color === 'b' ? -best : best;
  const playedForMover = color === 'b' ? -played : played;
  const throwsForcedWin = bestScore?.mate != null && Math.sign(bestScore.mate) === (color === 'w' ? 1 : -1)
    && !(playedScore?.mate != null && Math.sign(playedScore.mate) === Math.sign(bestScore.mate));
  const allowsForcedMate = playedScore?.mate != null && Math.sign(playedScore.mate) === (color === 'w' ? -1 : 1);
  const accepted = !throwsForcedWin && !allowsForcedMate && bestForMover >= playedForMover && lossCp <= goodLossCp;
  return {
    accepted,
    kind: accepted ? 'good' : 'missed',
    label: accepted ? 'Good move' : 'Not the best yet',
    lossCp,
    message: accepted ? 'Good move' : `Not the best yet — approximately ${Math.max(lossCp / 100, 0.01).toFixed(2)} pawns lost.`,
  };
}

export function createPracticeSession({ startFen, color, bestUci, bestSan, lines = [], bestScore = null, originalMoveUci = null, originalMoveSan = null, difficulty = 'Medium', gameKey = '', ply = 0 }) {
  return {
    startFen, fen: startFen, history: [], side: color, color, difficulty,
    phase: 'find', attempts: 0, hintsUsed: 0, cachedLines: lines,
    bestUci, bestSan, bestScore, originalMoveUci, originalMoveSan,
    gameKey, ply, foundBestFirstTry: false, result: null, revealed: false, missed: false,
  };
}

export function retryPracticeMove(session) {
  return { ...session, fen: session.startFen, attempts: session.attempts + 1, history: [], sanHistory: [], phase: 'find' };
}

export function revealPracticeMove(session, { bestFen = session.startFen, bestSan = session.bestSan } = {}) {
  return { ...session, phase: 'play', fen: bestFen, history: [session.bestUci], sanHistory: [bestSan], revealed: true, missed: true, foundBestFirstTry: false, bestSan };
}

export function keepPracticeMove(session, move) {
  return { ...session, phase: 'play', fen: move.fen, history: [...session.history, move.uci], sanHistory: [...(session.sanHistory || []), move.san], missed: true, foundBestFirstTry: false };
}

export function acceptPracticeMove(session, move, judgment) {
  return { ...session, phase: 'play', fen: move.fen, history: [...session.history, move.uci], sanHistory: [...(session.sanHistory || []), move.san], foundBestFirstTry: judgment.kind === 'best' && session.attempts === 0 && session.hintsUsed === 0, missed: !judgment.accepted };
}

export function practiceMove(session, move) {
  return { ...session, fen: move.fen, history: [...session.history, move.uci], sanHistory: [...(session.sanHistory || []), move.san] };
}

export function captureReviewState({ selectedPly, scrollTop = 0 }) { return { selectedPly, scrollTop }; }
export function restoreReviewState(state) { return { selectedPly: state?.selectedPly ?? null, scrollTop: state?.scrollTop ?? 0 }; }
