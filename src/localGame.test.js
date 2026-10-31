import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { DEFAULT_LOCAL_OPTIONS, LOCAL_GAME_KEY, LOCAL_GAME_VERSION, addClockIncrement, isCurrentHintResult, isLocalTurn, localClockStart, readLocalGame, resolveDrawOffer, restoreClockAfterUndo, tickClock, validateLocalGame, writeLocalGame } from './localGame.js';

function memoryStorage() {
  const items = new Map();
  return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => items.set(key, value), removeItem: (key) => items.delete(key) };
}

function saved(sans = []) {
  const game = new Chess(); const fens = [game.fen()];
  for (const san of sans) { game.move(san); fens.push(game.fen()); }
  return { version: LOCAL_GAME_VERSION, sans, fens, options: { ...DEFAULT_LOCAL_OPTIONS }, clocks: { w: 0, b: 0 }, hintCounts: { w: 0, b: 0 } };
}

describe('two-player local game state', () => {
  it('allows moves only for the active side and undo removes exactly one ply', () => {
    const game = new Chess();
    expect(isLocalTurn(game, 'w')).toBe(true);
    expect(isLocalTurn(game, 'b')).toBe(false);
    game.move('e4'); game.move('e5'); game.undo();
    expect(game.history()).toEqual(['e4']);
    expect(game.turn()).toBe('b');
  });

  it('resolves draw offers as accepted or declined', () => {
    expect(resolveDrawOffer(true)).toBe('draw');
    expect(resolveDrawOffer(false)).toBe('declined');
  });

  it('discards hint results from a previous position', () => {
    expect(isCurrentHintResult(4, 4)).toBe(true);
    expect(isCurrentHintResult(4, 5)).toBe(false);
  });

  it('decrements the active clock and restores its pre-move snapshot on undo', () => {
    const initial = localClockStart('5+0');
    const afterTick = tickClock(initial, 'w', 1250);
    expect(afterTick).toEqual({ w: 298750, b: 300000 });
    const incremented = addClockIncrement(afterTick, 'w', 10000);
    const restored = restoreClockAfterUndo([initial, afterTick], initial);
    expect(incremented.w).toBe(308750);
    expect(restored.clocks).toEqual(afterTick);
    expect(restored.history).toEqual([initial]);
    expect(tickClock({ w: 500, b: 900 }, 'w', 1000).w).toBe(0);
  });

  it('validates and restores saved SAN/FEN history; rejects corrupt positions', () => {
    const state = saved(['e4', 'e5']);
    expect(validateLocalGame(state)).toMatchObject({ sans: ['e4', 'e5'], options: DEFAULT_LOCAL_OPTIONS });
    expect(validateLocalGame({ ...state, fens: [state.fens[0]] })).toBeNull();
    const storage = memoryStorage();
    expect(writeLocalGame(state, storage)).toBe(true);
    expect(readLocalGame(storage)).toMatchObject({ sans: ['e4', 'e5'] });
    expect(storage.getItem(LOCAL_GAME_KEY)).toContain('e4');
  });
});
