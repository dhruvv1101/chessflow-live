import { Chess } from 'chess.js';

export const LOCAL_GAME_KEY = 'chessflow-live.local-game.v1';
export const LOCAL_GAME_VERSION = 1;
export const DEFAULT_LOCAL_OPTIONS = Object.freeze({
  whiteName: 'White', blackName: 'Black', hintsAllowed: true, orientation: 'fixed', clock: 'none',
});

export function cleanPlayerName(value, fallback) {
  return (typeof value === 'string' ? value.trim().slice(0, 16) : '') || fallback;
}

export function validateLocalGame(input) {
  if (!input || input.version !== LOCAL_GAME_VERSION || !Array.isArray(input.sans) || !Array.isArray(input.fens)) return null;
  if (input.sans.length > 500 || input.fens.length !== input.sans.length + 1 || input.sans.some((san) => typeof san !== 'string')) return null;
  const options = input.options || {};
  const validClocks = ['none', '5+0', '10+0', '15+10'];
  if (!['fixed', 'auto'].includes(options.orientation) || !validClocks.includes(options.clock)) return null;
  const game = new Chess();
  const fens = [game.fen()];
  try {
    for (const san of input.sans) {
      if (!game.move(san)) return null;
      fens.push(game.fen());
    }
  } catch { return null; }
  if (fens.some((fen, index) => fen !== input.fens[index])) return null;
  const clock = ['none', '5+0', '10+0', '15+10'].includes(options.clock) ? options.clock : 'none';
  const clocks = input.clocks && typeof input.clocks === 'object' ? input.clocks : {};
  const hints = input.hintCounts && typeof input.hintCounts === 'object' ? input.hintCounts : {};
  return {
    version: LOCAL_GAME_VERSION,
    sans: [...input.sans], fens,
    options: {
      whiteName: cleanPlayerName(options.whiteName, 'White'),
      blackName: cleanPlayerName(options.blackName, 'Black'),
      hintsAllowed: options.hintsAllowed !== false,
      orientation: options.orientation === 'auto' ? 'auto' : 'fixed', clock,
    },
    clocks: { w: Math.max(0, Number(clocks.w) || 0), b: Math.max(0, Number(clocks.b) || 0) },
    hintCounts: { w: Math.max(0, Number(hints.w) || 0), b: Math.max(0, Number(hints.b) || 0) },
    clockHistory: Array.isArray(input.clockHistory) ? input.clockHistory.slice(0, input.sans.length).map((entry) => ({ w: Math.max(0, Number(entry?.w) || 0), b: Math.max(0, Number(entry?.b) || 0) })) : [],
  };
}

function getStorage() { try { return globalThis.localStorage; } catch { return null; } }
export function readLocalGame(storage = getStorage()) {
  try { return validateLocalGame(JSON.parse(storage?.getItem(LOCAL_GAME_KEY) || 'null')); } catch { return null; }
}

export function writeLocalGame(game, storage = getStorage()) {
  try { storage?.setItem(LOCAL_GAME_KEY, JSON.stringify(game)); return true; } catch { return false; }
}

export function clearLocalGame(storage = getStorage()) {
  try { storage?.removeItem(LOCAL_GAME_KEY); } catch { /* storage can be unavailable */ }
}

export function restoreChess(gameData) {
  const game = new Chess();
  for (const san of gameData.sans) game.move(san);
  return game;
}

export function localClockStart(clock) {
  if (clock === 'none') return { w: 0, b: 0 };
  const [minutes] = clock.split('+').map(Number);
  const base = minutes * 60_000;
  return { w: base, b: base };
}

export function tickClock(clocks, color, elapsedMs) {
  return { ...clocks, [color]: Math.max(0, clocks[color] - Math.max(0, elapsedMs)) };
}

export function isLocalTurn(chess, color) { return chess.turn() === color; }
export function resolveDrawOffer(accepted) { return accepted ? 'draw' : 'declined'; }
export function addClockIncrement(clocks, color, incrementMs) { return { ...clocks, [color]: clocks[color] + incrementMs }; }
export function restoreClockAfterUndo(history, fallback) { return { history: history.slice(0, -1), clocks: history.at(-1) || fallback }; }

export function isCurrentHintResult(resultPositionId, currentPositionId) {
  return resultPositionId === currentPositionId;
}
