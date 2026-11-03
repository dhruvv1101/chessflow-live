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

export function hasEnoughUserMoves(game, minimumUserMoves = FREE_LIMITS.minimumUserMoves) {
  if (!game || !['white', 'black'].includes(game.userColor)) return false;
  const color = game.userColor === 'white' ? 'w' : 'b';
  return (game.moves || []).filter((move) => move.color === color).length >= minimumUserMoves;
}

/** Find the deepest named position on this game's own move path. Matching
 * Chess.com ECO headers disambiguate positions that occur in multiple ECOs. */
export function attachOpeningContexts(games, rows, database = {}) {
  const contexts = new Map();
  for (const game of games) {
    let deepest = null;
    const byPly = new Map();
    const headerEco = String(game.eco || '').trim().toUpperCase();
    for (const move of game.moves || []) {
      const exact = database[normalizePositionKey(move.fenAfter)] || null;
      const matchesHeader = !headerEco || !exact?.eco || exact.eco.toUpperCase() === headerEco;
      if (exact && matchesHeader) deepest = { ...exact, matchedPly: move.ply };
      byPly.set(move.ply, { opening: deepest, exactMatch: exact && matchesHeader ? exact : null, datasetMatch: exact });
    }
    contexts.set(game.url, byPly);
  }
  return rows.map((row) => {
    const byPly = contexts.get(row.gameKey);
    const current = byPly?.get(row.ply);
    const previous = byPly?.get(row.ply - 1);
    const openingContext = current?.opening || previous?.opening || null;
    const isNamedOpeningMove = Boolean(current?.datasetMatch);
    const tacticTags = isNamedOpeningMove
      ? (row.tacticTags || []).filter((tag) => tag.kind !== 'allowed-capture-hung-piece')
      : row.tacticTags;
    return {
      ...row, openingContext: openingContext ? { ...openingContext, color: games.find((game) => game.url === row.gameKey)?.userColor || null } : null,
      openingDatasetEntry: current?.datasetMatch || null, isNamedOpeningMove, tacticTags,
    };
  });
}

export function buildOpeningTree(games, rows, {
  database = {},
  minimumSampleGames = FREE_LIMITS.reportInsights.minimumSampleGames,
  lowConfidenceGames = FREE_LIMITS.reportInsights.lowConfidenceGames,
  maxExampleGames = FREE_LIMITS.reportInsights.maxExampleGames,
  minimumUserMoves = FREE_LIMITS.minimumUserMoves,
} = {}) {
  const gameById = new Map(games.filter((game) => hasEnoughUserMoves(game, minimumUserMoves)).map((game) => [game.url, game]));
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
      const opening = row.openingContext || (Object.hasOwn(row, 'openingContext') ? null : database[positionKey]) || null;
      node = {
        id, positionKey, color: game.userColor,
        name: opening?.name || `Position at ${row.notation || `ply ${row.ply}`}`,
        openingName: opening?.name || null, eco: opening?.eco || null,
        openingPlyCount: opening?.matchedPly ?? opening?.plyCount ?? null,
        positions: 0, _gameIds: new Set(), _results: new Map(), _changes: [], _drops: [], _gaps: [], _mistakes: 0, _times: [],
        _openingContexts: [], _openingGambits: [],
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
    if (row.openingContext?.name && row.openingContext?.eco) {
      node._openingContexts.push({
        color: game.userColor, eco: row.openingContext.eco, name: row.openingContext.name, gameId: game.url,
        result, winProbabilityChange: Number.isFinite(before) && Number.isFinite(after) ? after - before : null,
      });
      const namedMove = row.openingDatasetEntry || row.openingContext;
      if (row.isNamedOpeningMove && /gambit/i.test(namedMove?.name || '')) {
        node._openingGambits.push({ gameId: game.url, move: row.notation || row.playedSan, eco: namedMove.eco, name: namedMove.name });
      }
    }
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
      openingGambits: node._openingGambits,
      openingContexts: node._openingContexts,
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

export function buildOpeningSummary(tree, { minimumSampleGames = FREE_LIMITS.reportInsights.minimumSampleGames } = {}) {
  const groups = new Map();
  for (const node of tree?.nodes || []) {
    for (const context of node.openingContexts || []) {
      if (!context.eco || !context.name) continue;
      const key = `${context.color}|${context.eco}|${context.name}`;
      let group = groups.get(key);
      if (!group) {
        group = { color: context.color, eco: context.eco, name: context.name, _gameIds: new Set(), _results: new Map(), _changes: [], positionKeys: new Set() };
        groups.set(key, group);
      }
      group._gameIds.add(context.gameId);
      if (context.result != null) group._results.set(context.gameId, context.result);
      if (Number.isFinite(context.winProbabilityChange)) group._changes.push(context.winProbabilityChange);
      group.positionKeys.add(node.positionKey);
    }
  }
  return [...groups.values()].filter((group) => group._gameIds.size >= minimumSampleGames).map((group) => {
    const scores = [...group._results.values()];
    const changes = group._changes;
    return {
      color: group.color, eco: group.eco, name: group.name, games: group._gameIds.size,
      wins: scores.filter((score) => score === 1).length,
      draws: scores.filter((score) => score === 0.5).length,
      losses: scores.filter((score) => score === 0).length,
      averageWinProbabilityChange: mean(changes),
      lowConfidence: group._gameIds.size < FREE_LIMITS.reportInsights.lowConfidenceGames,
      positions: group.positionKeys.size,
    };
  }).sort((a, b) => b.games - a.games || a.eco.localeCompare(b.eco) || a.name.localeCompare(b.name));
}
