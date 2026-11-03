import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { FREE_LIMITS } from './config.js';
import { classifyMoveLoss, gamePhase, likelyTactic, normalizeAnalysisFen, parseClockSeconds, timeContext, winProbability, hasLostAdvantage } from './analysis.js';

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

  it('derives likely time context and elapsed time from clock data', () => {
    expect(parseClockSeconds('0:09:59.2')).toBeCloseTo(599.2);
    expect(timeContext({ spentSeconds: 1.2, remainingSeconds: 300 })).toMatchObject({ label: 'instant move', confidence: 'likely' });
    expect(timeContext({ spentSeconds: 45, remainingSeconds: 300, averageSpentSeconds: 15 })).toMatchObject({ label: 'long think', confidence: 'likely' });
    expect(timeContext({ spentSeconds: 2, remainingSeconds: 20 })).toMatchObject({ label: 'low clock', confidence: 'likely' });
    expect(timeContext({ spentSeconds: null, remainingSeconds: null })).toMatchObject({ label: 'unknown', confidence: null });
  });

  it('detects a lost advantage using configurable player-perspective thresholds', () => {
    expect(hasLostAdvantage({ cp: 250 }, { cp: 100 })).toBe(true);
    expect(hasLostAdvantage({ cp: 190 }, { cp: 0 })).toBe(false);
    expect(hasLostAdvantage({ cp: 500 }, { cp: 450 })).toBe(false);
    expect(hasLostAdvantage({ mate: 2 }, { cp: 500 })).toBe(true);
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
});
