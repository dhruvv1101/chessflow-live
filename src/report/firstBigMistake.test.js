import { describe, expect, it } from 'vitest';
import { summarizeFirstBigMistakes } from './firstBigMistake.js';

describe('first major mistake summary', () => {
  it('records the first eval-swinging mistake only for lost games and summarizes it', () => {
    const games = [
      { url: 'lost-1', result: '0-1', userColor: 'white' },
      { url: 'lost-2', result: '0-1', userColor: 'white' },
      { url: 'won', result: '1-0', userColor: 'white' },
    ];
    const row = (gameKey, ply, classification, phase, tacticTags = []) => ({ gameKey, ply, fullmove: Math.ceil(ply / 2), notation: `${Math.ceil(ply / 2)}. Nf3`, playedSan: 'Nf3', classification, isUserMove: true, winProbabilityLoss: 0.2, timeSpentSeconds: 10, phase, tacticTags });
    const result = summarizeFirstBigMistakes(games, [
      row('lost-1', 7, 'Mistake', 'middlegame', [{ kind: 'missed-capture' }]), row('lost-1', 9, 'Blunder', 'endgame'),
      row('lost-2', 11, 'Blunder', 'middlegame', [{ kind: 'missed-capture' }]), row('won', 3, 'Blunder', 'opening'),
    ]);

    expect(result).toMatchObject({ gamesLost: 2, gamesWithFirstMistake: 2, averagePly: 9, mostCommonPhase: 'middlegame', mostCommonTag: 'missed-capture' });
    expect(result.entries.map((entry) => entry.gameId)).toEqual(['lost-1', 'lost-2']);
  });
});
