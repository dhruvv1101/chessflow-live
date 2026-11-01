import { describe, expect, it } from 'vitest';
import { loadTrainingGames, loadPracticeResults, recordPracticeResult, recordTrainingGame, summarizeTraining } from './training.js';

const storage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

describe('local chess training history', () => {
  it('aggregates reviewed games without inventing an Elo rating', () => {
    const stats = summarizeTraining([
      { date: '2026-11-01T00:00:00.000Z', rows: [
        { label: 'Blunder', lossCp: 250, gamePhase: 'opening', bestWhiteCp: 320, color: 'w' },
        { label: 'Inaccuracy', lossCp: 80, gamePhase: 'endgame', bestWhiteCp: 10, color: 'b' },
      ] },
    ]);
    expect(stats).toMatchObject({ games: 1, blundersPerGame: 1, inaccuraciesPerGame: 1, averageLossCp: 165, openingMistakes: 1, endgameMistakes: 1 });
    expect(stats.officialRating).toBeNull();
  });

  it('stores a bounded set of per-game review rows in local browser storage', () => {
    const local = storage();
    recordTrainingGame([{ label: 'Good', lossCp: 25 }], '1. e4', local, '2026-11-01T00:00:00.000Z');
    expect(loadTrainingGames(local)).toHaveLength(1);
  });

  it('records local practice outcomes and aggregates first-try success', () => {
    const local = storage();
    recordPracticeResult({ gameKey: 'game', ply: 4, attempts: 0, hintsUsed: 0, foundBestFirstTry: true, result: 'win' }, local, '2026-11-02T00:00:00.000Z');
    recordPracticeResult({ gameKey: 'game', ply: 8, attempts: 2, hintsUsed: 1, foundBestFirstTry: false, result: 'draw' }, local, '2026-11-02T00:00:00.000Z');
    expect(loadPracticeResults(local)).toHaveLength(2);
    expect(summarizeTraining([], loadPracticeResults(local))).toMatchObject({ mistakesPracticed: 2, foundBestMoveFirstTryPercent: 50 });
  });
});
