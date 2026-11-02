import { describe, expect, it } from 'vitest';
import { acceptPracticeMove, captureReviewState, createPracticeSession, judgePracticeMove, keepPracticeMove, restoreReviewState, revealPracticeMove, retryPracticeMove } from './practice.js';

describe('practice move judging', () => {
  const base = { color: 'w', bestUci: 'e2e4', lines: [{ uci: 'e2e4' }, { uci: 'd2d4' }], bestScore: { cp: 50 } };
  it('accepts the engine best move and a cached principal line', () => {
    expect(judgePracticeMove({ ...base, moveUci: 'e2e4', playedScore: { cp: 50 } }).label).toBe('Best move!');
    expect(judgePracticeMove({ ...base, moveUci: 'd2d4', playedScore: { cp: 45 } }).label).toBe('Best move!');
  });
  it('accepts a move within the configured good-loss threshold', () => {
    expect(judgePracticeMove({ ...base, lines: [], moveUci: 'g1f3', playedScore: { cp: 22 }, goodLossCp: 30 }).label).toBe('Good move');
  });
  it('rejects a move outside the threshold without exposing the best move', () => {
    const result = judgePracticeMove({ ...base, lines: [], moveUci: 'a2a3', playedScore: { cp: -60 }, goodLossCp: 30 });
    expect(result.accepted).toBe(false);
    expect(result.label).toBe('Not the best yet');
    expect(result.lossCp).toBe(110);
    expect(result.message).not.toContain('e2e4');
  });
  it('does not accept a move that throws away a forced win or permits a forced mate', () => {
    expect(judgePracticeMove({ ...base, lines: [], bestScore: { mate: 3 }, moveUci: 'g1f3', playedScore: { cp: 500 } }).accepted).toBe(false);
    expect(judgePracticeMove({ ...base, lines: [], bestScore: { cp: 50 }, moveUci: 'g1f3', playedScore: { mate: -2 } }).accepted).toBe(false);
  });
});

describe('practice state transitions', () => {
  const state = createPracticeSession({ startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', color: 'w', bestUci: 'e2e4', bestSan: 'e4', lines: [{ uci: 'e2e4', san: 'e4' }], difficulty: 'Hard', gameKey: 'test', ply: 4 });
  it('starts in find, supports retry, reveal, and keep-my-move transitions', () => {
    expect(state.phase).toBe('find');
    expect(retryPracticeMove(state).attempts).toBe(1);
    expect(revealPracticeMove(state)).toMatchObject({ phase: 'play', foundBestFirstTry: false, revealed: true });
    expect(keepPracticeMove(state, { uci: 'a2a3', san: 'a3', fen: 'next' })).toMatchObject({ phase: 'play', missed: true, history: ['a2a3'] });
  });
  it('moves from find to play after a judged legal candidate is accepted', () => {
    const judgment = judgePracticeMove({ color: 'w', moveUci: 'e2e4', bestUci: 'e2e4', bestScore: { cp: 0 }, playedScore: { cp: 0 } });
    expect(acceptPracticeMove(state, { uci: 'e2e4', san: 'e4', fen: 'after' }, judgment)).toMatchObject({ phase: 'play', history: ['e2e4'], sanHistory: ['e4'], foundBestFirstTry: true, lastMoveFeedback: 'Best move!' });
  });
  it('keeps the original review state separate and preserves the complete starting FEN', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(createPracticeSession({ startFen: fen, color: 'b', bestUci: 'e7e5', bestSan: 'e5', lines: [], gameKey: 'x', ply: 2 }).startFen).toBe(fen);
  });
  it('restores the exact selected review ply and move-list scroll position', () => {
    const snapshot = captureReviewState({ selectedPly: 4, scrollTop: 271 });
    expect(restoreReviewState(snapshot)).toEqual({ selectedPly: 4, scrollTop: 271 });
  });
});
