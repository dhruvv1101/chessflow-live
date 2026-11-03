import { FREE_LIMITS } from './config.js';

const FLAGGED = new Set(['Inaccuracy', 'Mistake', 'Blunder']);

export function normalizePositionKey(fen) {
  return String(fen || '').trim().split(/\s+/).slice(0, 4).join(' ');
}

function gameScoreForUser(game) {
  if (game.result === '1/2-1/2') return 0.5;
  if (game.userColor === 'white') return game.result === '1-0' ? 1 : game.result === '0-1' ? 0 : null;
  if (game.userColor === 'black') return game.result === '0-1' ? 1 : game.result === '1-0' ? 0 : null;
  return null;
}

function mean(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

export function buildOpeningTree(games, rows, {
  database = {},
  minimumSampleGames = FREE_LIMITS.reportInsights.minimumSampleGames,
  lowConfidenceGames = FREE_LIMITS.reportInsights.lowConfidenceGames,
  maxExampleGames = FREE_LIMITS.reportInsights.maxExampleGames,
} = {}) {
  const gameById = new Map(games.map((game) => [game.url, game]));
  const positions = new Map();
  const links = new Map();
  const userRowsByGame = new Map();

  for (const row of rows) {
    if (!row.isUserMove || !row.fenBefore || !gameById.has(row.gameKey)) continue;
    const game = gameById.get(row.gameKey);
    if (game.userColor !== 'white' && game.userColor !== 'black') continue;
    const positionKey = row.positionKey || normalizePositionKey(row.fenBefore);
    const id = `${game.userColor}:${positionKey}`;
    let node = positions.get(id);
    if (!node) {
      const opening = database[positionKey] || null;
      node = {
        id, positionKey, color: game.userColor,
        name: opening?.name || `Position at ${row.notation || `ply ${row.ply}`}`,
        openingName: opening?.name || null, eco: opening?.eco || null,
        openingPlyCount: opening?.plyCount ?? null,
        positions: 0, _gameIds: new Set(), _results: new Map(), _changes: [], _drops: [], _gaps: [], _mistakes: 0, _times: [],
      };
      positions.set(id, node);
    }
    node.positions += 1;
    const result = gameScoreForUser(game);
    node._gameIds.add(game.url);
    if (!node._results.has(game.url) && result != null) node._results.set(game.url, result);
    const before = row.evaluationBefore?.winProbability;
    const after = row.evaluationAfter?.winProbability;
    if (Number.isFinite(before) && Number.isFinite(after)) node._changes.push(after - before);
    if (result != null && Number.isFinite(before)) node._gaps.push(result - before);
    if (Number.isFinite(row.winProbabilityLoss)) node._drops.push(row.winProbabilityLoss);
    if (FLAGGED.has(row.classification)) node._mistakes += 1;
    if (Number.isFinite(row.timeSpentSeconds)) node._times.push(row.timeSpentSeconds);
    const gameRows = userRowsByGame.get(game.url) || [];
    gameRows.push({ row, id });
    userRowsByGame.set(game.url, gameRows);
  }

  const nodes = [...positions.values()].map((node) => {
    const resultsByGameId = Object.fromEntries(node._results);
    const scores = [...node._results.values()];
    const gamesCount = node._gameIds.size;
    return {
      id: node.id, positionKey: node.positionKey, color: node.color,
      name: node.name, openingName: node.openingName, eco: node.eco, openingPlyCount: node.openingPlyCount,
      games: gamesCount, wins: scores.filter((score) => score === 1).length,
      draws: scores.filter((score) => score === 0.5).length,
      losses: scores.filter((score) => score === 0).length,
      positions: node.positions,
      averageWinProbabilityChange: mean(node._changes),
      averageWinProbabilityLoss: mean(node._drops),
      expectedScoreGap: mean(node._gaps),
      mistakeRate: node.positions ? node._mistakes / node.positions : 0,
      averageTimeSpentSeconds: mean(node._times),
      resultByGameId: resultsByGameId,
      gameIds: [...node._gameIds],
      exampleGameIds: [...node._gameIds].slice(0, maxExampleGames),
      meetsMinimumSample: gamesCount >= minimumSampleGames,
      lowConfidence: gamesCount < lowConfidenceGames,
      children: [],
    };
  });

  // The tree view is a d3-hierarchy-ready root with one canonical node per
  // normalized position. Directed transition links preserve move order without
  // cloning transposed positions or making a multi-parent hierarchy.
  for (const gameRows of userRowsByGame.values()) {
    gameRows.sort((a, b) => a.row.ply - b.row.ply);
    for (let index = 1; index < gameRows.length; index += 1) {
      const previous = gameRows[index - 1];
      const current = gameRows[index];
      const moveGap = current.row.ply - previous.row.ply;
      if (moveGap !== 2) continue;
      const linkKey = `${previous.id}|${current.id}|${previous.row.playedUci}|${previous.row.opponentResponseUci || ''}`;
      if (!links.has(linkKey)) links.set(linkKey, {
        source: previous.id, target: current.id,
        move: previous.row.playedSan, opponentReply: previous.row.opponentResponseSan || null,
      });
    }
  }

  const whiteNodes = nodes.filter((node) => node.color === 'white');
  const blackNodes = nodes.filter((node) => node.color === 'black');
  const sortNodes = (list) => list.sort((a, b) => (a.openingPlyCount ?? 99) - (b.openingPlyCount ?? 99) || b.games - a.games || a.positionKey.localeCompare(b.positionKey));
  return {
    name: 'ChessFlow opening positions',
    children: [
      { name: 'White', color: 'white', children: sortNodes(whiteNodes) },
      { name: 'Black', color: 'black', children: sortNodes(blackNodes) },
    ],
    nodes,
    links: [...links.values()],
  };
}

export function buildOpeningSummary(tree) {
  const groups = new Map();
  for (const node of tree?.nodes || []) {
    if (!node.openingName || !node.eco || !node.meetsMinimumSample) continue;
    const key = `${node.eco}|${node.openingName}`;
    let group = groups.get(key);
    if (!group) {
      group = { eco: node.eco, name: node.openingName, _gameIds: new Set(), _results: new Map(), _changes: [], positionKeys: new Set() };
      groups.set(key, group);
    }
    for (const gameId of node.gameIds) group._gameIds.add(gameId);
    for (const [gameId, score] of Object.entries(node.resultByGameId)) group._results.set(gameId, score);
    if (Number.isFinite(node.averageWinProbabilityChange)) {
      for (let sample = 0; sample < node.positions; sample += 1) group._changes.push(node.averageWinProbabilityChange);
    }
    group.positionKeys.add(node.positionKey);
  }
  return [...groups.values()].map((group) => {
    const scores = [...group._results.values()];
    const changes = group._changes;
    return {
      eco: group.eco, name: group.name, games: group._gameIds.size,
      wins: scores.filter((score) => score === 1).length,
      draws: scores.filter((score) => score === 0.5).length,
      losses: scores.filter((score) => score === 0).length,
      averageWinProbabilityChange: mean(changes),
      lowConfidence: group._gameIds.size < FREE_LIMITS.reportInsights.lowConfidenceGames,
      positions: group.positionKeys.size,
    };
  }).sort((a, b) => b.games - a.games || a.eco.localeCompare(b.eco) || a.name.localeCompare(b.name));
}
