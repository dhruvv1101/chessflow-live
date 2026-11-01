import { describe, expect, it } from 'vitest';
import { buildTimeline, classifyMove } from './analysis.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('move analysis timeline', () => {
  it('reconstructs every ply without mutating the source FEN or history', () => {
    const timeline = buildTimeline(START, ['e4', 'e5', 'Nf3']);
    expect(timeline.fens).toHaveLength(4);
    expect(timeline.moves.map(({ san, color }) => [san, color])).toEqual([['e4', 'w'], ['e5', 'b'], ['Nf3', 'w']]);
    expect(timeline.positionAt(0).fen()).toBe(START);
    expect(timeline.positionAt(2).fen()).toBe(timeline.fens[2]);
    expect(timeline.positionAt(2).history()).toEqual([]);
  });

  it('rejects an illegal move with its ply number', () => {
    expect(() => buildTimeline(START, ['e5'])).toThrow(/move 1/i);
  });

  it('keeps fullmove numbering from a custom start FEN in practice timelines', () => {
    const timeline = buildTimeline('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 23', ['e4', 'e5']);
    expect(timeline.moves.map(({ number, san, color }) => [number, color, san])).toEqual([[23, 'w', 'e4'], [23, 'b', 'e5']]);
    const blackStarts = buildTimeline('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 23', ['e5', 'Nf3']);
    expect(blackStarts.moves.map(({ number, color, san }) => [number, color, san])).toEqual([[23, 'b', 'e5'], [24, 'w', 'Nf3']]);
  });

  it('uses configurable centipawn-loss thresholds and reserves book labels for known lines', () => {
    expect(classifyMove({ lossCp: 0 })).toBe('Best');
    expect(classifyMove({ lossCp: 25 })).toBe('Excellent');
    expect(classifyMove({ lossCp: 50 })).toBe('Good');
    expect(classifyMove({ lossCp: 90 })).toBe('Inaccuracy');
    expect(classifyMove({ lossCp: 150 })).toBe('Mistake');
    expect(classifyMove({ lossCp: 250 })).toBe('Blunder');
    expect(classifyMove({ lossCp: 0, book: true })).toBe('Book');
    expect(classifyMove({ lossCp: 0, thresholds: { best: 5 } })).toBe('Best');
  });
});
