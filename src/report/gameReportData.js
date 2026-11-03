const FLAGGED_CLASSES = new Set(['Inaccuracy', 'Mistake', 'Blunder']);

export function resultFromUserSide(game) {
  if (game.result === '1/2-1/2') return 'Draw';
  if (!['1-0', '0-1'].includes(game.result)) return game.result === '*' ? 'In progress' : 'Unknown';
  if (!['white', 'black'].includes(game.userColor)) return 'Unknown';
  const userWon = game.userColor === 'white' ? game.result === '1-0' : game.result === '0-1';
  return userWon ? 'Win' : 'Loss';
}

export function filterGamesByIds(games, ids) {
  if (!ids || !ids.length) return games;
  const allowed = new Set(ids);
  return games.filter((game) => allowed.has(game.url));
}

export function buildEvalGraphData(game, rows, { width = 760, height = 250, padding = 20 } = {}) {
  const gameRows = (rows || []).filter((row) => row.gameKey === game?.url).sort((a, b) => a.ply - b.ply);
  const maxPly = Math.max(1, gameRows.at(-1)?.ply || game?.moves?.length || 1);
  const raw = [{ ply: 0, winProbability: 0.5, classification: null, row: null }, ...gameRows.map((row) => ({
    ply: row.ply,
    winProbability: Number.isFinite(row.evaluationAfter?.winProbability) ? Math.max(0, Math.min(1, row.evaluationAfter.winProbability)) : null,
    classification: row.isUserMove && FLAGGED_CLASSES.has(row.classification) ? row.classification : null,
    notation: row.notation,
    row,
  }))].filter((point) => Number.isFinite(point.winProbability));
  const xAt = (ply) => padding + (ply / maxPly) * (width - 2 * padding);
  const yAt = (value) => padding + (1 - value) * (height - 2 * padding);
  return {
    width, height, maxPly, evenY: yAt(0.5),
    points: raw.map((point) => ({ ...point, x: xAt(point.ply), y: yAt(point.winProbability) })),
    path: raw.map((point, index) => `${index ? 'L' : 'M'} ${xAt(point.ply)} ${yAt(point.winProbability)}`).join(' '),
    flagged: raw.filter((point) => point.classification),
  };
}
