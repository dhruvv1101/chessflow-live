import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { FREE_LIMITS } from './config.js';
import { captureTags, classifyMoveLoss, compareMoveLoss, gamePhase, likelyTactic, normalizeAnalysisFen, parseClockSeconds, timeContext, winProbability, hasLostAdvantage } from './analysis.js';

describe('report move analysis helpers', () => {
  it('normalizes whitespace while preserving all FEN fields', () => {
    expect(normalizeAnalysisFen('  8/8/8/8/8/8/8/K6k   w   -   -   42   87 '))
      .toBe('8/8/8/8/8/8/8/K6k w - - 42 87');
  });

  it('converts White evaluations to each player perspective and handles forced mates', () => {
    expect(winProbability({ cp: 400, mate: null }, 'white')).toBeCloseTo(0.9091, 3);
    expect(winProbability({ cp: 400, mate: null }, 'black')).toBeCloseTo(0.0909, 3);
    expect(winProbability({ cp: null, mate: 3 }, 'white')).toBe(1);
    expect(winProbability({ cp: null, mate: 3 }, 'black')).toBe(0);
  });

  it('uses configurable expected-score loss thresholds', () => {
    expect(classifyMoveLoss(0.049)).toBe('Good');
    expect(classifyMoveLoss(FREE_LIMITS.lossThresholds.inaccuracy)).toBe('Inaccuracy');
    expect(classifyMoveLoss(FREE_LIMITS.lossThresholds.mistake)).toBe('Mistake');
    expect(classifyMoveLoss(FREE_LIMITS.lossThresholds.blunder)).toBe('Blunder');
  });

  it('classifies phases from material and move number, not move number alone', () => {
    expect(gamePhase('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 1)).toBe('opening');
    expect(gamePhase('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 16', 31)).toBe('middlegame');
    expect(gamePhase('8/8/6k1/8/8/4K3/8/8 w - - 0 50', 99)).toBe('endgame');
    expect(gamePhase('r4rk1/p1p1bppp/1pbqpn2/1B6/3P4/P1N1B3/1PPQ1PPP/R3K2R w KQ - 0 14', 27)).toBe('middlegame');
    expect(gamePhase('r4rk1/p1p1bppp/1pBqpn2/8/3P4/P1N1B3/1PPQ1PPP/R3K2R b KQ - 0 14', 28)).toBe('middlegame');
  });

  it('uses the game time control for time labels and calls ordinary pacing normal', () => {
    expect(parseClockSeconds('0:09:59.2')).toBeCloseTo(599.2);
    expect(timeContext({ spentSeconds: 0.2, remainingSeconds: 50, baseTimeSeconds: 60, timeClass: 'bullet' })).toMatchObject({ label: 'normal pace', confidence: 'likely' });
    expect(timeContext({ spentSeconds: 0.05, remainingSeconds: 50, baseTimeSeconds: 60, timeClass: 'bullet' })).toMatchObject({ label: 'instant move', confidence: 'likely' });
    expect(timeContext({ spentSeconds: 2, remainingSeconds: 6, baseTimeSeconds: 60, timeClass: 'bullet' })).toMatchObject({ label: 'low clock', confidence: 'likely' });
    expect(timeContext({ spentSeconds: 45, remainingSeconds: 300, averageSpentSeconds: 15, baseTimeSeconds: 300, timeClass: 'blitz' })).toMatchObject({ label: 'long think', confidence: 'likely' });
    expect(timeContext({ spentSeconds: null, remainingSeconds: null })).toMatchObject({ label: 'unknown', confidence: null });
  });

  it('zeros the loss for the exact best move and moves within the configured centipawn margin', () => {
    const before = { cp: 400, mate: null };
    expect(compareMoveLoss({ playedUci: 'e2e4', bestMoveUci: 'e2e4', beforeWhiteScore: before, afterWhiteScore: { cp: -300, mate: null }, moverColor: 'white' }))
      .toMatchObject({ lossCp: 0, winProbabilityLoss: 0, bestOrWithinMargin: true });
    expect(compareMoveLoss({ playedUci: 'd2d4', bestMoveUci: 'e2e4', beforeWhiteScore: before, afterWhiteScore: { cp: 380, mate: null }, moverColor: 'white' }))
      .toMatchObject({ lossCp: 0, winProbabilityLoss: 0, bestOrWithinMargin: true });
    expect(compareMoveLoss({ playedUci: 'd2d4', bestMoveUci: 'e2e4', beforeWhiteScore: before, afterWhiteScore: { cp: 300, mate: null }, moverColor: 'white' }).lossCp)
      .toBe(75);
  });

  it('detects a lost advantage using configurable player-perspective thresholds', () => {
    expect(hasLostAdvantage({ cp: 250 }, { cp: 100 })).toBe(true);
    expect(hasLostAdvantage({ cp: 418 }, { cp: 281 })).toBe(false);
    expect(hasLostAdvantage({ cp: 555 }, { cp: 344 })).toBe(false);
    expect(hasLostAdvantage({ cp: 400 }, { cp: 100 })).toBe(true);
    expect(hasLostAdvantage({ mate: 2 }, { cp: 500 })).toBe(false);
    expect(hasLostAdvantage({ mate: 3 }, { mate: -1 })).toBe(true);
  });

  it('labels tactical patterns as likely and ties them to legal engine moves', () => {
    const beforeCapture = 'q3k3/8/8/8/8/8/8/R3K3 w - - 0 1';
    expect(likelyTactic({ beforeFen: beforeCapture, afterFen: beforeCapture, bestMoveUci: 'a1a8' }))
      .toMatchObject({ kind: 'missed_capture', confidence: 'likely', basis: 'engine_best_move' });

    const hangingFen = '4k3/8/8/8/8/8/P5q1/4K2R w - - 0 1';
    const after = new Chess(hangingFen);
    after.move('a3');
    expect(likelyTactic({ beforeFen: hangingFen, afterFen: after.fen(), bestMoveUci: 'e1d1', opponentResponseUci: 'g2h1' }))
      .toMatchObject({ kind: 'hung_piece', confidence: 'likely', basis: 'engine_reply_capture' });
  });

  it('distinguishes a played capture that loses value from a missed capture', () => {
    const fen = 'q3k3/8/8/8/8/8/8/R3K3 w - - 0 1';
    const played = new Chess(fen);
    played.move('Rxa8+');
    expect(captureTags({ beforeFen: fen, playedUci: 'a1a8', bestMoveUci: 'a1a8', lossCp: 80 }))
      .toEqual([{ kind: 'played-capture-lost-value', confidence: 'likely', description: 'The played move is a capture and the engine marks it as a mistake or worse.' }]);

    const missed = new Chess(fen);
    missed.move('Kd1');
    expect(captureTags({ beforeFen: fen, playedUci: 'e1d1', bestMoveUci: 'a1a8', lossCp: 80 }))
      .toContainEqual(expect.objectContaining({ kind: 'missed-capture', confidence: 'likely' }));
  });

  it('tags only a legal engine reply that wins material as an allowed capture', () => {
    const fen = '4k3/8/8/8/8/8/P5q1/4K2R w - - 0 1';
    const played = new Chess(fen);
    played.move('a3');
    expect(captureTags({ beforeFen: fen, playedUci: 'a2a3', bestMoveUci: 'e1d1', afterFen: played.fen(), opponentResponseUci: 'g2h1', opponentResponsePvUci: ['g2h1'], lossCp: 300 }))
      .toContainEqual(expect.objectContaining({ kind: 'allowed-capture-hung-piece', confidence: 'likely' }));

    expect(captureTags({ beforeFen: fen, playedUci: 'a2a3', bestMoveUci: 'a2a3', afterFen: played.fen(), opponentResponseUci: null, lossCp: 0 })).toEqual([]);
  });
});
