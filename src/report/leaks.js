import { FREE_LIMITS } from './config.js';
import { normalizePositionKey } from './tree.js';

const FLAGGED = new Set(['Inaccuracy', 'Mistake', 'Blunder']);
const TAG_LABELS = Object.freeze({
  'played-capture-lost-value': 'Played capture that lost value',
  'missed-capture': 'Missed capture',
  'allowed-capture-hung-piece': 'Allowed capture / hung piece',
});

function sumExpectedLoss(rows) {
  return rows.reduce((sum, row) => sum + Math.max(0, Number(row.winProbabilityLoss) || 0), 0);
}

function makeLeak(kind, key, title, rows, options) {
  const gameIds = [...new Set(rows.map((row) => row.gameKey))];
  if (gameIds.length < options.minimumSampleGames) return null;
  const expectedScoreLoss = sumExpectedLoss(rows);
  const frequency = rows.length;
  return {
    id: `${kind}:${key}`, kind, key, title,
    frequency, gamesAffected: gameIds.length, expectedScoreLoss,
    score: frequency * expectedScoreLoss,
    averageSwing: rows.length ? expectedScoreLoss / rows.length : 0,
    lowConfidence: gameIds.length < options.lowConfidenceGames,
    examples: rows.slice(0, options.maxExampleGames).map((row) => ({
      gameId: row.gameKey, ply: row.ply, move: row.notation, playedSan: row.playedSan,
      bestMoveSan: row.bestMoveSan || null, fenBefore: row.fenBefore || null,
      timeSpentSeconds: Number.isFinite(row.timeSpentSeconds) ? row.timeSpentSeconds : null,
      timeContext: row.timeContext || 'unknown',
      replyTimeSeconds: row.missedChance && Number.isFinite(row.timeSpentSeconds) ? row.timeSpentSeconds : null,
      row,
    })),
  };
}

export function detectLeaks(games, rows, {
  tree = null,
  minimumSampleGames = FREE_LIMITS.reportInsights.minimumSampleGames,
  lowConfidenceGames = FREE_LIMITS.reportInsights.lowConfidenceGames,
  maxExampleGames = FREE_LIMITS.reportInsights.maxExampleGames,
  expectedScoreGap = FREE_LIMITS.reportInsights.openingLeakExpectedScoreGap,
  topN = FREE_LIMITS.topLeaks,
} = {}) {
  const options = { minimumSampleGames, lowConfidenceGames, maxExampleGames };
  const gameById = new Map(games.map((game) => [game.url, game]));
  const userRows = rows.filter((row) => row.isUserMove && FLAGGED.has(row.classification));
  const leaks = [];
  const repeatedMoves = new Map();
  for (const row of userRows) {
    const game = gameById.get(row.gameKey);
    if (!game || !row.playedUci) continue;
    const positionKey = row.positionKey || (row.fenBefore ? normalizePositionKey(row.fenBefore) : '');
    if (!positionKey) continue;
    const key = `${positionKey}|${row.playedUci}`;
    const group = repeatedMoves.get(key) || [];
    group.push(row);
    repeatedMoves.set(key, group);
  }
  for (const [key, badRows] of repeatedMoves) {
    const leak = makeLeak('opening', key, `Repeated bad move: ${badRows[0].playedSan}`, badRows, options);
    if (leak) leaks.push(leak);
  }

  for (const node of tree?.nodes || []) {
    if (!node.meetsMinimumSample || !Number.isFinite(node.expectedScoreGap) || node.expectedScoreGap > -expectedScoreGap) continue;
    const nodeRows = userRows.filter((row) => (row.positionKey || normalizePositionKey(row.fenBefore)) === node.positionKey);
    const leak = makeLeak('opening', `${node.positionKey}|below-expected`, `Below-expected results in ${node.openingName || 'this opening position'}`, nodeRows, options);
    if (leak) leaks.push({ ...leak, expectedScoreGap: node.expectedScoreGap, openingName: node.openingName, eco: node.eco });
  }

  const conversionRows = userRows.filter((row) => row.lostAdvantage);
  if (conversionRows.length) {
    const leak = makeLeak('conversion', 'lost-advantage', 'Lost winning advantage', conversionRows, options);
    if (leak) leaks.push(leak);
  }

  const missedRows = userRows.filter((row) => row.missedChance);
  if (missedRows.length) {
    const leak = makeLeak('missed-chance', 'missed-opponent-blunders', 'Missed chances after opponent mistakes', missedRows, options);
    if (leak) leaks.push(leak);
  }

  const timeGroups = new Map();
  for (const row of userRows) {
    if (!['long think', 'low clock', 'instant move'].includes(row.timeContext)) continue;
    const group = timeGroups.get(row.timeContext) || [];
    group.push(row);
    timeGroups.set(row.timeContext, group);
  }
  for (const [context, timeRows] of timeGroups) {
    const leak = makeLeak('time-management', context, `Mistakes after ${context} replies`, timeRows, options);
    if (leak) leaks.push(leak);
  }

  const tacticGroups = new Map();
  for (const row of userRows) {
    for (const tag of row.tacticTags || []) {
      const group = tacticGroups.get(tag.kind) || [];
      group.push(row);
      tacticGroups.set(tag.kind, group);
    }
  }
  for (const [tag, tacticRows] of tacticGroups) {
    const leak = makeLeak('tactical', tag, TAG_LABELS[tag] || tag, tacticRows, options);
    if (leak) leaks.push(leak);
  }

  return leaks.sort((a, b) => b.score - a.score || b.frequency - a.frequency || a.title.localeCompare(b.title)).slice(0, topN);
}
