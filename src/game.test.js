import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { getGameStatus, getMoveList, makeLegalMove, toWhiteScore } from './game.js';

describe('chess game rules', () => {
  it('rejects an illegal move without changing the board', () => {
    const chess = new Chess();
    expect(makeLegalMove(chess, { from: 'e2', to: 'e5' })).toBeNull();
    expect(chess.fen()).toBe(new Chess().fen());
  });

  it('accepts a legal move and lists it in algebraic notation', () => {
    const chess = new Chess();
    expect(makeLegalMove(chess, { from: 'e2', to: 'e4' }).san).toBe('e4');
    expect(getMoveList(chess)).toEqual(['1. e4']);
  });

  it('applies a legal UCI move returned by Stockfish', () => {
    const chess = new Chess();
    expect(makeLegalMove(chess, 'e2e4').san).toBe('e4');
  });

  it('detects checkmate and stalemate', () => {
    const mate = new Chess('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1');
    const stale = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(getGameStatus(mate).kind).toBe('checkmate');
    expect(getGameStatus(stale).kind).toBe('stalemate');
  });

  it('converts engine scores from side-to-move to White perspective', () => {
    expect(toWhiteScore({ cp: 42, mate: null }, 'w')).toEqual({ cp: 42, mate: null });
    expect(toWhiteScore({ cp: 42, mate: null }, 'b')).toEqual({ cp: -42, mate: null });
    expect(toWhiteScore({ cp: null, mate: 3 }, 'b')).toEqual({ cp: null, mate: -3 });
  });
});
