import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteAllLessons, importLessons, loadLessons, recordLessonHandling, saveLesson, updateLesson, deleteLesson } from './lessonStorage.js';
import { clearReportGames, saveReportGames } from './storage.js';

async function resetDb() {
  await deleteAllLessons().catch(() => {});
}

describe('local lesson storage', () => {
  beforeEach(resetDb);

  it('enforces the configurable limit and supports notes, mastery and deletion', async () => {
    const one = await saveLesson({ kind: 'move', normalizedFen: 'position', myNote: '' }, { maxLessons: 1 });
    await expect(saveLesson({ kind: 'move', normalizedFen: 'position' }, { maxLessons: 1 })).rejects.toThrow('1-lesson limit');
    await updateLesson(one.id, { myNote: 'Pause before moving' });
    await recordLessonHandling(one.id, 'game:3', { threshold: 1 });
    expect(await loadLessons()).toMatchObject([{ id: one.id, myNote: 'Pause before moving', status: 'mastered', correctHandlings: 1 }]);
    await deleteLesson(one.id);
    expect(await loadLessons()).toEqual([]);
  });

  it('round trips exported lessons through validated import', async () => {
    const saved = await saveLesson({ kind: 'opening_line', normalizedFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -', sourceGameIds: ['reference-only'] });
    const payload = { format: 'chessflow-lessons', version: 1, lessons: [{ ...saved, id: undefined }] };
    await deleteAllLessons();
    const imported = await importLessons(payload.lessons, { maxLessons: 2 });
    expect(imported).toHaveLength(1);
    expect(await loadLessons()).toMatchObject([{ kind: 'opening_line', sourceGameIds: ['reference-only'] }]);
  });

  it('keeps lessons when imported games are deleted', async () => {
    await saveLesson({ kind: 'move', normalizedFen: 'position' });
    await saveReportGames([{ url: 'game-reference', endTime: 1, moves: [] }]);
    await clearReportGames();
    expect(await loadLessons()).toHaveLength(1);
  });
});
