import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { FREE_LIMITS } from './config.js';
import { classifyMoveLoss, gamePhase, likelyTactic, normalizeAnalysisFen, timeContext, winProbability } from './analysis.js';

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

  it('tags opening, middlegame and endgame positions', () => {
    expect(gamePhase('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 1)).toBe('opening');
    expect(gamePhase('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 16', 31)).toBe('middlegame');
    expect(gamePhase('8/8/6k1/8/8/4K3/8/8 w - - 0 50', 99)).toBe('endgame');
  });

  it('derives clock context from per-move clock comments', () => {
    expect(timeContext('0:00:20')).toBe('time trouble');
    expect(timeContext('0:01:30')).toBe('rushed');
    expect(timeContext('0:05:00')).toBe('had plenty of time');
    expect(timeContext(null)).toBe('unknown');
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
