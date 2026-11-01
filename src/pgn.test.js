import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { buildGamePgn, escapePgnHeader } from './pgn.js';

describe('buildGamePgn', () => {
  it('writes standard escaped headers and full legal movetext', () => {
    const game = new Chess();
    game.move('e4'); game.move('e5'); game.move('Nf3'); game.move('Nc6');
    const pgn = buildGamePgn(game, { date: new Date('2026-11-02T12:00:00Z'), white: 'A "Player"', black: 'Opponent', result: '*' });
    expect(pgn).toContain('[Event "ChessFlow Live game"]');
    expect(pgn).toContain('[Site "chessflow-live"]');
    expect(pgn).toContain('[Date "2026.11.02"]');
    expect(pgn).toContain('[White "A \\"Player\\""]');
    expect(pgn).toContain('[Black "Opponent"]');
    expect(pgn).toContain('[Result "*"]');
    expect(pgn).toContain('1. e4 e5 2. Nf3 Nc6 *');
    expect(pgn).not.toContain('[SetUp');
  });

  it('adds setup headers for a custom start FEN and preserves promotions and mate notation', () => {
    const startFen = '7k/P7/6K1/8/8/8/8/8 w - - 0 1';
    const game = new Chess(startFen);
    game.move({ from: 'a7', to: 'a8', promotion: 'q' });
    const pgn = buildGamePgn(game, { startFen, result: '1-0', date: new Date('2026-11-02T12:00:00Z') });
    expect(pgn).toContain('[SetUp "1"]');
    expect(pgn).toContain(`[FEN "${startFen}"]`);
    expect(pgn).toContain('1. a8=Q# 1-0');
  });
});

it('escapes PGN header values', () => {
  expect(escapePgnHeader('a "quote" \\ slash')).toBe('a \\"quote\\" \\\\ slash');
});
