import { Chess } from 'chess.js';
import { FREE_LIMITS } from './config.js';
import { normalizeAnalysisFen, playerScore, winProbability, classifyMoveLoss, gamePhase, timeContext, likelyTactic, captureTags, hasLostAdvantage, compareMoveLoss } from './analysis.js';
import { reportAnalysisCache } from './analysisCache.js';
import { subscribeLiveGameActive } from './analysisCoordinator.js';
import { createStockfishSearch } from './stockfishSearch.js';

function abortError() { return new DOMException('Report analysis cancelled.', 'AbortError'); }

function invertScore(score) {
  return { cp: score?.cp == null ? null : -score.cp, mate: score?.mate == null ? null : -score.mate };
}

function scoreWhiteToMove(fen, sideScore) {
  return fen.split(/\s+/)[1] === 'b' ? invertScore(sideScore) : { cp: sideScore?.cp ?? 0, mate: sideScore?.mate ?? null };
}

function sanLine(fen, moves) {
  const chess = new Chess(fen);
  const san = [];
  for (const uci of moves || []) {
    if (!uci || uci.length < 4) break;
    try {
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (!move) break;
      san.push(move.san);
    } catch { break; }
  }
  return san;
}

function terminalPosition(fen) {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) return { whiteScore: { cp: null, mate: chess.turn() === 'w' ? -1 : 1 }, bestMoveUci: null, pvUci: [], pvSan: [], depth: 0, nodes: 0, engineName: 'Stockfish 19' };
  if (chess.isDraw()) return { whiteScore: { cp: 0, mate: null }, bestMoveUci: null, pvUci: [], pvSan: [], depth: 0, nodes: 0, engineName: 'Stockfish 19' };
  return null;
}

function validateMove(move, color) {
  const chess = new Chess(move.fenBefore);
  if (chess.turn() !== color || !move.uci || move.uci.length < 4) throw new TypeError('Imported game move does not match its recorded position.');
  let applied;
  try { applied = chess.move({ from: move.uci.slice(0, 2), to: move.uci.slice(2, 4), promotion: move.uci[4] }); } catch { applied = null; }
  if (!applied) throw new TypeError('Imported game contains an illegal move.');
  return applied;
}

function enrichPosition(fen, cached) {
  return { ...cached, pvSan: sanLine(fen, cached.pvUci), bestMoveSan: sanLine(fen, cached.bestMoveUci ? [cached.bestMoveUci] : [])[0] || null };
}

export function createGameAnalyzer({
  search,
  cache = reportAnalysisCache,
  depth = FREE_LIMITS.analysisDepth,
  lossThresholds = FREE_LIMITS.lossThresholds,
  lostAdvantageThresholds = FREE_LIMITS.lostAdvantage,
  yieldMs = 12,
} = {}) {
  const runSearch = search || createStockfishSearch();
  let paused = false;
  let disposed = false;
  let running = false;
  let runController = null;
  let activeSearchController = null;
  let resumeWaiter = null;

  const pause = () => {
    if (disposed) return;
    paused = true;
    activeSearchController?.abort();
  };
  const resume = () => {
    paused = false;
    resumeWaiter?.();
    resumeWaiter = null;
  };
  const cancel = () => {
    if (!runController) return;
    runController.abort();
    activeSearchController?.abort();
    resumeWaiter?.();
    resumeWaiter = null;
  };
  const unsubscribeLiveGame = subscribeLiveGameActive((active) => { if (active) pause(); else resume(); });

  async function awaitRunnable() {
    while (paused) {
      if (runController.signal.aborted) throw abortError();
      await new Promise((resolve) => { resumeWaiter = resolve; });
    }
    if (runController.signal.aborted) throw abortError();
  }

  async function positionEvaluation(fen) {
    const normalizedFen = normalizeAnalysisFen(fen);
    const terminal = terminalPosition(normalizedFen);
    if (terminal) return terminal;
    while (true) {
      await awaitRunnable();
      let cached = null;
      try { cached = await cache.get(normalizedFen, depth); } catch { /* analysis still works when local caching is unavailable */ }
      if (cached) return enrichPosition(normalizedFen, cached);
      const controller = new AbortController();
      activeSearchController = controller;
      const abortFromRun = () => controller.abort();
      runController.signal.addEventListener('abort', abortFromRun, { once: true });
      try {
        const engineResult = await runSearch(normalizedFen, { depth, signal: controller.signal });
        if (runController.signal.aborted) throw abortError();
        const result = {
          whiteScore: scoreWhiteToMove(normalizedFen, engineResult.score),
          bestMoveUci: engineResult.bestMoveUci || null,
          pvUci: engineResult.pvUci || [],
          depth: engineResult.depth || depth,
          nodes: engineResult.nodes || 0,
          engineName: engineResult.engineName || 'Stockfish 19',
        };
        try { await cache.put(normalizedFen, depth, result); } catch { /* analysis still works when the cache is read-only */ }
        return enrichPosition(normalizedFen, result);
      } catch (error) {
        if (runController.signal.aborted) throw abortError();
        if (controller.signal.aborted && error?.name === 'AbortError') continue;
        throw error;
      } finally {
        runController.signal.removeEventListener('abort', abortFromRun);
        if (activeSearchController === controller) activeSearchController = null;
      }
    }
  }

  async function analyzeGames(games, { signal, onProgress = () => {} } = {}) {
    if (disposed) throw new Error('Report analysis session has been disposed.');
    if (running) throw new Error('Report analysis is already running.');
    running = true;
    runController = new AbortController();
    const cancelFromCaller = () => cancel();
    signal?.addEventListener('abort', cancelFromCaller, { once: true });
    const work = [];
    for (const game of games) {
      const moves = game.moves || [];
      const averages = new Map();
      for (const move of moves) {
        if (!Number.isFinite(move.timeSpentSeconds)) continue;
        const samples = averages.get(move.color) || [];
        samples.push(move.timeSpentSeconds);
        averages.set(move.color, samples);
      }
      const averageTimes = new Map([...averages].map(([color, values]) => [color, values.reduce((sum, value) => sum + value, 0) / values.length]));
      for (const move of moves) if (move.color === 'w' || move.color === 'b') work.push({ game, move, color: move.color, averageSpentSeconds: averageTimes.get(move.color) });
    }
    const rows = [];
    try {
      onProgress({ completed: 0, total: work.length, gameIndex: 0, ply: 0 });
      for (let index = 0; index < work.length; index += 1) {
        await awaitRunnable();
        const { game, move, color, averageSpentSeconds } = work[index];
        const applied = validateMove(move, color);
        const before = await positionEvaluation(move.fenBefore);
        await awaitRunnable();
        const after = await positionEvaluation(move.fenAfter);
        const moverColor = color === 'w' ? 'white' : 'black';
        const userColor = game.userColor === 'black' ? 'black' : 'white';
        const isUserMove = game.userColor === moverColor;
        const beforeEvaluation = { ...before, userScore: playerScore(before.whiteScore, userColor), winProbability: winProbability(before.whiteScore, userColor) };
        const afterEvaluation = { ...after, userScore: playerScore(after.whiteScore, userColor), winProbability: winProbability(after.whiteScore, userColor) };
        const moveLoss = compareMoveLoss({
          playedUci: move.uci, bestMoveUci: before.bestMoveUci,
          beforeWhiteScore: before.whiteScore, afterWhiteScore: after.whiteScore,
          moverColor,
        });
        const classification = classifyMoveLoss(moveLoss.winProbabilityLoss, lossThresholds);
        const moverBeforeScore = playerScore(before.whiteScore, moverColor);
        const moveTimeContext = timeContext({
          spentSeconds: move.timeSpentSeconds, remainingSeconds: move.clockRemainingSeconds,
          averageSpentSeconds, baseTimeSeconds: game.baseTimeSeconds, timeClass: game.timeClass,
        });
        const fullmove = Number(move.fenBefore.split(/\s+/)[5]) || Math.ceil(move.ply / 2);
        const isFlagged = ['Inaccuracy', 'Mistake', 'Blunder'].includes(classification);
        const moveCaptureTags = isFlagged ? captureTags({
          beforeFen: move.fenBefore, afterFen: move.fenAfter, playedUci: move.uci,
          bestMoveUci: before.bestMoveUci, opponentResponseUci: after.bestMoveUci,
          opponentResponsePvUci: after.pvUci, lossCp: moveLoss.lossCp,
        }) : [];
        rows.push({
          gameKey: game.url, ply: move.ply,
          fullmove,
          notation: `${fullmove}${color === 'b' ? '...' : '.'} ${applied.san}`,
          userColor, moverColor, isUserMove,
          playedSan: applied.san, playedUci: move.uci,
          bestMoveUci: before.bestMoveUci, bestMoveSan: before.bestMoveSan,
          opponentResponseUci: after.bestMoveUci, opponentResponseSan: after.bestMoveSan,
          principalVariationUci: before.pvUci, principalVariationSan: before.pvSan,
          evaluationBefore: beforeEvaluation, evaluationAfter: afterEvaluation,
          evaluationLossCp: moveLoss.lossCp,
          winProbabilityLoss: moveLoss.winProbabilityLoss, classification,
          lostAdvantage: hasLostAdvantage(moverBeforeScore, moveLoss.effectiveAfterScore, lostAdvantageThresholds),
          phase: gamePhase(move.fenBefore, move.ply),
          timeSpentSeconds: Number.isFinite(move.timeSpentSeconds) ? move.timeSpentSeconds : null,
          clockRemainingSeconds: Number.isFinite(move.clockRemainingSeconds) ? move.clockRemainingSeconds : null,
          timeContext: moveTimeContext.label,
          timeContextConfidence: moveTimeContext.confidence,
          tactic: isFlagged
            ? likelyTactic({ beforeFen: move.fenBefore, afterFen: move.fenAfter, bestMoveUci: before.bestMoveUci, opponentResponseUci: after.bestMoveUci, beforePlayerScore: moverBeforeScore }) : null,
          tacticTags: moveCaptureTags,
          depth: Math.min(before.depth, after.depth), nodes: before.nodes + after.nodes,
        });
        onProgress({ completed: index + 1, total: work.length, gameIndex: games.indexOf(game) + 1, ply: move.ply });
        if (yieldMs > 0) await new Promise((resolve) => setTimeout(resolve, yieldMs));
      }
      for (let index = 1; index < rows.length; index += 1) {
        const previous = rows[index - 1];
        const current = rows[index];
        const opponentMadeMistake = ['Mistake', 'Blunder'].includes(previous.classification);
        if (current.isUserMove && current.gameKey === previous.gameKey && current.ply === previous.ply + 1
          && !previous.isUserMove && opponentMadeMistake && current.evaluationLossCp > 0
          && ['Inaccuracy', 'Mistake', 'Blunder'].includes(current.classification)) {
          current.missedChance = {
            confidence: 'likely',
            opponentMoveNotation: previous.notation,
            opponentMoveClassification: previous.classification,
            bestReplySan: current.bestMoveSan,
            playedSan: current.playedSan,
          };
        }
      }
      if (cache.putGame) {
        for (const game of games) {
          try { await cache.putGame(game.url, depth, rows.filter((row) => row.gameKey === game.url)); }
          catch { /* Results remain available in memory if local persistence is unavailable. */ }
        }
      }
      return rows;
    } finally {
      signal?.removeEventListener('abort', cancelFromCaller);
      runController = null;
      activeSearchController = null;
      running = false;
    }
  }

  return {
    analyzeGames, pause, resume, cancel,
    dispose() {
      if (disposed) return;
      cancel();
      disposed = true;
      unsubscribeLiveGame();
      runSearch.dispose?.();
    },
    get isPaused() { return paused; },
    get isRunning() { return running; },
  };
}

export function createReportAnalysisSession(options = {}) {
  const search = createStockfishSearch(options);
  return createGameAnalyzer({ ...options, search });
}
