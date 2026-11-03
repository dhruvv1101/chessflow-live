import { Chess } from 'chess.js';
import { FREE_LIMITS } from './config.js';
import { reportAnalysisCache } from './analysisCache.js';
import { createStockfishSearch } from './stockfishSearch.js';

function formatScore(score) {
  if (score?.mate != null) return score.mate < 0 ? `Mated in ${Math.abs(score.mate)}` : `Mate in ${score.mate}`;
  if (!Number.isFinite(score?.cp)) return 'unavailable';
  const pawns = score.cp / 100;
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(2)}`;
}

function toSanLine(fen, uciLine = []) {
  const chess = new Chess(fen);
  const sans = [];
  for (const uci of uciLine) {
    try {
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (!move) break;
      sans.push(move.san);
    } catch { break; }
  }
  return sans;
}

function whiteScoreFromSearch(fen, score) {
  if (fen.split(/\s+/)[1] !== 'b') return { cp: score?.cp ?? 0, mate: score?.mate ?? null };
  return { cp: score?.cp == null ? null : -score.cp, mate: score?.mate == null ? null : -score.mate };
}

function explainBestMove(row, depth) {
  if (!row.bestMoveSan) return 'No legal best-move line was stored for this position.';
  const line = row.principalVariationSan?.join(' ') || row.bestMoveSan;
  if (row.fenBefore && row.bestMoveUci) {
    try {
      const chess = new Chess(row.fenBefore);
      const move = chess.move({ from: row.bestMoveUci.slice(0, 2), to: row.bestMoveUci.slice(2, 4), promotion: row.bestMoveUci[4] });
      if (move?.isCheckmate()) return `${row.bestMoveSan} is the engine’s forced-mate move. Verified line: ${line}.`;
      if (move?.isCheck()) return `${row.bestMoveSan} gives check in the engine’s top line. Verified line: ${line}.`;
      if (move?.isCapture()) return `${row.bestMoveSan} captures a piece in the engine’s top line. Verified line: ${line}.`;
      if (move?.flags?.includes('k')) return `${row.bestMoveSan} castles in the engine’s top line. Verified line: ${line}.`;
    } catch { /* use the engine-only explanation below for malformed cached positions */ }
  }
  return `Stockfish ranked ${row.bestMoveSan} as the best alternative at depth ${row.depth || depth}. Its verified continuation is ${line}.`;
}

async function analyzeFlaggedFen(fen, depth) {
  const search = createStockfishSearch();
  try {
    const result = await search(fen, { depth });
    return {
      whiteScore: whiteScoreFromSearch(fen, result.score),
      bestMoveUci: result.bestMoveUci,
      pvUci: result.pvUci || [], depth: result.depth, nodes: result.nodes, engineName: result.engineName,
    };
  } finally { search.dispose(); }
}

async function resolveOpponentLine(row, { cache, reanalyze, depth }) {
  if (Array.isArray(row.opponentPrincipalVariationSan) && row.opponentPrincipalVariationSan.length) return row.opponentPrincipalVariationSan;
  if (!row.fenAfter) return [];
  let cached = null;
  try { cached = await cache.get(row.fenAfter, depth); } catch { /* cache is optional */ }
  if (!cached?.pvUci?.length) {
    try {
      cached = await reanalyze(row.fenAfter, depth);
      if (cached?.pvUci?.length) await cache.put(row.fenAfter, depth, cached);
    } catch { return []; }
  }
  return toSanLine(row.fenAfter, cached?.pvUci || []);
}

export async function buildMoveExplanation(row, {
  cache = reportAnalysisCache,
  reanalyze = analyzeFlaggedFen,
  depth = FREE_LIMITS.analysisDepth,
} = {}) {
  const opponentLine = await resolveOpponentLine(row, { cache, reanalyze, depth });
  const opponentReply = opponentLine[0] || row.opponentResponseSan || null;
  const bestMoveIdea = explainBestMove(row, depth);
  const opponentContext = row.missedChance
    ? `After ${row.missedChance.opponentMoveNotation} (${row.missedChance.opponentMoveClassification}), the engine preferred ${row.missedChance.bestReplySan}; you played ${row.missedChance.playedSan}.`
    : null;
  return {
    played: row.notation || `Ply ${row.ply}${row.playedSan ? ` ${row.playedSan}` : ''}`,
    classification: row.classification || 'Analysis',
    evaluationBefore: formatScore(row.evaluationBefore?.userScore),
    evaluationAfter: formatScore(row.evaluationAfter?.userScore),
    why: `Stockfish estimated a ${row.classification || 'move'} loss of ${formatScore({ cp: row.evaluationLossCp })} from your side.`,
    opponentReply,
    opponentLine,
    bestMove: row.bestMoveSan || null,
    bestMoveIdea,
    opponentContext,
    tacticalContext: row.tacticTags?.map((tag) => tag.description).filter(Boolean) || [],
  };
}
