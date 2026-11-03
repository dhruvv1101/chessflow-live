import { FREE_LIMITS } from './config.js';

function lostByUser(game) {
  if (game.userColor === 'white') return game.result === '0-1';
  if (game.userColor === 'black') return game.result === '1-0';
  return false;
}

function mostCommon(values) {
  const counts = new Map();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || null;
}

export function summarizeFirstBigMistakes(games, rows, {
  minimumWinProbabilityLoss = FREE_LIMITS.reportInsights.firstBigMistakeMinimumWinProbabilityLoss,
} = {}) {
  const entries = [];
  let gamesLost = 0;
  for (const game of games) {
    if (!lostByUser(game)) continue;
    gamesLost += 1;
    const first = rows.filter((row) => row.gameKey === game.url && row.isUserMove
      && ['Mistake', 'Blunder'].includes(row.classification)
      && Number(row.winProbabilityLoss) >= minimumWinProbabilityLoss)
      .sort((a, b) => a.ply - b.ply)[0];
    if (!first) continue;
    entries.push({
      gameId: game.url, ply: first.ply, phase: first.phase || 'unknown', move: first.notation || first.playedSan,
      playedSan: first.playedSan, timeSpentSeconds: Number.isFinite(first.timeSpentSeconds) ? first.timeSpentSeconds : null,
      tag: first.tacticTags?.[0]?.kind || first.tactic?.kind || null,
    });
  }
  return {
    gamesLost, gamesWithFirstMistake: entries.length, entries,
    averagePly: entries.length ? entries.reduce((sum, entry) => sum + entry.ply, 0) / entries.length : null,
    mostCommonPhase: mostCommon(entries.map((entry) => entry.phase)),
    mostCommonTag: mostCommon(entries.map((entry) => entry.tag)),
  };
}
