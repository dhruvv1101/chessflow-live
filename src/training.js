export const TRAINING_KEY = 'chessflow-live.training.v1';
export const PRACTICE_KEY = 'chessflow-live.practice.v1';

function read(storage) {
  try {
    const value = JSON.parse(storage?.getItem(TRAINING_KEY) || '[]');
    return Array.isArray(value) ? value.filter((game) => Array.isArray(game.rows)) : [];
  } catch { return []; }
}

function gameId(text) {
  let hash = 2166136261;
  for (const char of text) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16);
}

export function loadTrainingGames(storage = globalThis.localStorage) { return read(storage); }

export function loadPracticeResults(storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage?.getItem(PRACTICE_KEY) || '[]');
    return Array.isArray(value) ? value.filter((row) => row && typeof row.gameKey === 'string' && Number.isInteger(row.ply)) : [];
  } catch { return []; }
}

export function recordPracticeResult(result, storage = globalThis.localStorage, date = new Date().toISOString()) {
  const row = {
    gameKey: String(result.gameKey || 'unknown').slice(0, 120), ply: Math.max(0, Number(result.ply) || 0),
    attempts: Math.max(0, Number(result.attempts) || 0), hintsUsed: Math.max(0, Number(result.hintsUsed) || 0),
    foundBestFirstTry: Boolean(result.foundBestFirstTry), result: ['win', 'draw', 'loss'].includes(result.result) ? result.result : 'unknown', date,
  };
  try {
    const saved = loadPracticeResults(storage).filter((entry) => !(entry.gameKey === row.gameKey && entry.ply === row.ply));
    storage?.setItem(PRACTICE_KEY, JSON.stringify([row, ...saved].slice(0, 500)));
    globalThis.dispatchEvent?.(new CustomEvent('chessflow:training-updated'));
  } catch { /* Local practice stats are optional when browser storage is blocked. */ }
  return row;
}

export function recordTrainingGame(rows, pgn, storage = globalThis.localStorage, date = new Date().toISOString()) {
  const id = gameId(`${pgn}\n${rows.map((row) => row.uci || row.san).join(' ')}`);
  const games = read(storage).filter((game) => game.id !== id);
  const saved = { id, date, rows: rows.map(({ label, lossCp, gamePhase, bestWhiteCp, color, motifs = [] }) => ({ label, lossCp, gamePhase, bestWhiteCp, color, motifs })) };
  try { storage?.setItem(TRAINING_KEY, JSON.stringify([saved, ...games].slice(0, 100))); } catch { /* local training is optional */ }
  return saved;
}

export function summarizeTraining(games, practicesOrNow = [], nowValue = Date.now()) {
  const practices = Array.isArray(practicesOrNow) ? practicesOrNow : [];
  const now = typeof practicesOrNow === 'number' ? practicesOrNow : nowValue;
  const rows = games.flatMap((game) => game.rows);
  const mistakes = rows.filter((row) => ['Inaccuracy', 'Mistake', 'Blunder'].includes(row.label));
  const count = (label) => rows.filter((row) => row.label === label).length;
  const recentCutoff = now - 7 * 24 * 60 * 60 * 1000;
  const recentRows = games.filter((game) => Date.parse(game.date) >= recentCutoff).flatMap((game) => game.rows);
  return {
    games: games.length,
    analyzedPlies: rows.length,
    blundersPerGame: games.length ? Number((count('Blunder') / games.length).toFixed(1)) : 0,
    inaccuraciesPerGame: games.length ? Number((count('Inaccuracy') / games.length).toFixed(1)) : 0,
    averageLossCp: rows.length ? Math.round(rows.reduce((total, row) => total + (Number(row.lossCp) || 0), 0) / rows.length) : 0,
    openingMistakes: mistakes.filter((row) => row.gamePhase === 'opening').length,
    middlegameMistakes: mistakes.filter((row) => row.gamePhase === 'middlegame').length,
    endgameMistakes: mistakes.filter((row) => row.gamePhase === 'endgame').length,
    missedWinningOpportunities: mistakes.filter((row) => row.color === 'w' ? row.bestWhiteCp >= 200 : row.bestWhiteCp <= -200).length,
    verifiedTacticalClues: mistakes.filter((row) => row.motifs?.length).length,
    recentMistakes: recentRows.filter((row) => ['Inaccuracy', 'Mistake', 'Blunder'].includes(row.label)).length,
    officialRating: null,
    mistakesPracticed: practices.length,
    foundBestMoveFirstTryPercent: practices.length ? Math.round(practices.filter((row) => row.foundBestFirstTry).length / practices.length * 100) : 0,
  };
}
