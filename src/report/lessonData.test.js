import { describe, expect, it } from 'vitest';
import { lessonDraftFromRow, lessonExportPayload, lessonWhyLikely, matchLesson, normalizeLessonFen, suggestLessons, validateLessonImport } from './lessonData.js';

const row = (overrides = {}) => ({
  fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  playedSan: 'e4', bestMoveSan: 'd4', isUserMove: true, classification: 'Blunder', phase: 'opening',
  timeContext: 'instant move', timeSpentSeconds: 1.9, winProbabilityLoss: 0.22,
  evaluationBefore: { winProbability: 0.8 }, evaluationAfter: { winProbability: 0.58 }, gameKey: 'game-a', ply: 1,
  tacticTags: [{ kind: 'missed-capture' }], ...overrides,
});
const game = { url: 'game-a', userColor: 'white' };

describe('lesson data helpers', () => {
  it('auto-fills factual reflection and likely learning language', () => {
    const draft = lessonDraftFromRow(row({ missedChance: { confidence: 'likely' } }), game);
    expect(draft.whatHappened).toContain('You played e4');
    expect(draft.whatHappened).toContain('80% to 58%');
    expect(draft.whatHappened).toContain('best was d4');
    expect(draft.whyLikely).toContain('likely: you replied in 1.9s');
    expect(draft.howToImprove).toContain('Before capturing');
  });

  it('matches exact mistakes, opening lines and similar patterns with examples', () => {
    const source = lessonDraftFromRow(row(), game, { id: 'lesson', openingKey: 'C20-position' });
    expect(matchLesson(source, row(), game)).toMatchObject({ kind: 'exact', repeatedMistake: true, confidence: 'high' });
    const line = { ...source, kind: 'opening_line', normalizedFen: 'other position', playedMove: 'Nf3' };
    expect(matchLesson(line, row({ classification: 'Good' }), game, { openingKey: 'C20-position' })).toMatchObject({ kind: 'line', handledBetter: true });
    const pattern = { ...source, kind: 'move', normalizedFen: 'other position', playedMove: 'other', tags: ['missed-capture', 'opening', 'instant move'] };
    expect(matchLesson(pattern, row({ classification: 'Good' }), game)).toMatchObject({ kind: 'pattern', label: 'Similar situation (likely)', handledBetter: true });
    expect(matchLesson({ ...source, status: 'mastered' }, row(), game)).toBeNull();
  });

  it('ranks repeated mistakes by repeats times points lost and exports an importable payload', () => {
    const games = [game, { url: 'game-b', userColor: 'white' }];
    const repeatedRows = [row(), row({ gameKey: 'game-b', winProbabilityLoss: 0.3 }), row({ classification: 'Good', gameKey: 'game-b' })];
    const suggestions = suggestLessons(games, repeatedRows, { leaks: [{ id: 'opening:repeat', title: 'Repeated e4 blunder', frequency: 2, expectedScoreLoss: 0.52, examples: [{ gameId: 'game-a', row: repeatedRows[0] }] }] });
    expect(suggestions[0]).toMatchObject({ repeatCount: 2, pointsLost: 0.52, source: 'suggested' });
    const payload = lessonExportPayload([{ id: 'one', ...suggestions[0], normalizedFen: row().fenBefore }]);
    expect(validateLessonImport(payload)).toHaveLength(1);
    expect(normalizeLessonFen(row().fenBefore)).toBe(row().fenBefore.split(' ').slice(0, 4).join(' '));
  });

  it('puts repeated leak patterns before individual blunders and excludes single non-blunders', () => {
    const games = [game, { url: 'game-b', userColor: 'white' }];
    const suggestions = suggestLessons(games, [row(), row({ gameKey: 'game-b', ply: 3, playedSan: 'Nf3', winProbabilityLoss: 0.12, classification: 'Mistake' })], {
      leaks: [{ id: 'tactical:missed', title: 'Missed capture pattern', frequency: 3, expectedScoreLoss: 0.48, examples: [{ gameId: 'game-a', row: row() }] }],
    });
    expect(suggestions[0]).toMatchObject({ suggestionType: 'pattern', repeatCount: 3, title: 'Missed capture pattern' });
    expect(suggestions.some((item) => item.playedMove === 'Nf3')).toBe(false);
    expect(suggestions[1]).toMatchObject({ suggestionType: 'single', repeatCount: 1, playedMove: 'e4' });
  });

  it('uses “likely” in heuristic context and does not fabricate a cause', () => {
    expect(lessonWhyLikely({ timeContext: 'normal pace' })).toContain('likely: this was a normal pace move');
    expect(lessonWhyLikely({})).toContain('No clear reason is recorded');
  });
});
