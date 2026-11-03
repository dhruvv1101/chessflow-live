import { describe, expect, it } from 'vitest';
import { detectLeaks } from './leaks.js';

const game = (url, result = '0-1') => ({ url, result, userColor: 'white', moves: Array.from({ length: 6 }, (_, index) => ({ color: index % 2 ? 'b' : 'w' })) });
const row = (gameKey, overrides = {}) => ({
  gameKey, ply: 12, notation: '6. Bxd5', positionKey: 'position-key', fenBefore: 'fen', playedUci: 'c4d5', playedSan: 'Bxd5',
  classification: 'Blunder', isUserMove: true, winProbabilityLoss: 0.3, evaluationLossCp: 180, phase: 'middlegame',
  timeContext: 'normal pace', timeSpentSeconds: 12, lostAdvantage: false, tacticTags: [], evaluationBefore: { winProbability: 0.8 },
  ...overrides,
});

describe('report leak detection', () => {
  it('ranks repeated bad moves by frequency times summed expected-score loss', () => {
    const games = [game('g1'), game('g2'), game('g3')];
    const rows = [row('g1'), row('g2'), row('g3', { playedUci: 'a2a3', playedSan: 'a3', positionKey: 'other', winProbabilityLoss: 0.2 })];
    const leaks = detectLeaks(games, rows, { minimumSampleGames: 2, topN: 5 });
    const repeatedMove = leaks.find((leak) => leak.kind === 'opening' && leak.key === 'position-key|c4d5');
    expect(repeatedMove).toMatchObject({ frequency: 2, gamesAffected: 2, expectedScoreLoss: 0.6, score: 1.2 });
    expect(repeatedMove.examples).toHaveLength(2);
  });

  it('aggregates conversion, missed-chance, time and tactical leaks with sample labels', () => {
    const games = [game('g1'), game('g2')];
    const rows = [
      row('g1', { lostAdvantage: true, missedChance: { opponentMoveNotation: '5... Qh4', opponentMoveClassification: 'Blunder' }, timeContext: 'low clock', tacticTags: [{ kind: 'allowed-capture-hung-piece' }] }),
      row('g2', { lostAdvantage: true, missedChance: { opponentMoveNotation: '9... Ra1', opponentMoveClassification: 'Mistake' }, timeContext: 'low clock', tacticTags: [{ kind: 'allowed-capture-hung-piece' }] }),
      row('g1', { ply: 2, positionKey: 'normal-1', timeContext: 'normal pace', classification: 'Good' }),
      row('g2', { ply: 2, positionKey: 'normal-2', timeContext: 'normal pace', classification: 'Good' }),
      row('g2', { ply: 4, positionKey: 'normal-3', timeContext: 'normal pace', classification: 'Good' }),
    ];
    const leaks = detectLeaks(games, rows, { minimumSampleGames: 2, timeLeakMinimumMoves: 2, topN: 10 });
    expect(leaks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'conversion', frequency: 2, gamesAffected: 2 }),
      expect.objectContaining({ kind: 'missed-chance', frequency: 2, gamesAffected: 2 }),
      expect.objectContaining({ kind: 'time-management', key: 'low clock', frequency: 2 }),
      expect.objectContaining({ kind: 'tactical', key: 'allowed-capture-hung-piece', frequency: 2 }),
    ]));
  });

  it('compares time-context mistake rates to normal pace and requires a clear increase', () => {
    const games = [game('a'), game('b'), game('c')];
    const rows = [
      row('a', { ply: 1, positionKey: 'long-a', timeContext: 'long think', classification: 'Blunder' }),
      row('b', { ply: 1, positionKey: 'long-b', timeContext: 'long think', classification: 'Mistake' }),
      row('b', { ply: 1, positionKey: 'long-c', timeContext: 'long think', classification: 'Good' }),
      row('b', { ply: 3, positionKey: 'normal-a', timeContext: 'normal pace', classification: 'Blunder' }),
      row('c', { ply: 1, positionKey: 'normal-b', timeContext: 'normal pace', classification: 'Good' }),
      row('c', { ply: 3, positionKey: 'normal-c', timeContext: 'normal pace', classification: 'Good' }),
    ];
    const timing = detectLeaks(games, rows, { topN: 20 }).find((leak) => leak.kind === 'time-management');
    expect(timing).toMatchObject({ baseline: { contextRate: 2 / 3, normalRate: 1 / 3, contextMoves: 3, normalMoves: 3 } });
    const noClearDifference = rows.map((entry) => entry.timeContext === 'long think' ? { ...entry, classification: 'Good' } : entry);
    expect(detectLeaks(games, noClearDifference, { topN: 20 }).some((leak) => leak.kind === 'time-management')).toBe(false);
  });

  it('excludes short imported games from leak ranking', () => {
    const short = { url: 'short', result: '0-1', userColor: 'white', moves: [{ color: 'w' }, { color: 'b' }, { color: 'w' }, { color: 'b' }] };
    const long = game('long');
    const leaks = detectLeaks([short, long], [row('short'), row('long')], { topN: 20 });
    expect(leaks.flatMap((leak) => leak.examples).some((example) => example.gameId === 'short')).toBe(false);
  });
});
