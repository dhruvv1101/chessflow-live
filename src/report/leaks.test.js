import { describe, expect, it } from 'vitest';
import { detectLeaks } from './leaks.js';

const game = (url, result = '0-1') => ({ url, result, userColor: 'white' });
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
    ];
    const leaks = detectLeaks(games, rows, { minimumSampleGames: 2, topN: 10 });
    expect(leaks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'conversion', frequency: 2, gamesAffected: 2 }),
      expect.objectContaining({ kind: 'missed-chance', frequency: 2, gamesAffected: 2 }),
      expect.objectContaining({ kind: 'time-management', key: 'low clock', frequency: 2 }),
      expect.objectContaining({ kind: 'tactical', key: 'allowed-capture-hung-piece', frequency: 2 }),
    ]));
  });
});
