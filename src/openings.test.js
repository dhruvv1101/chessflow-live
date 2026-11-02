import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { compileOpeningRows, parseOpeningRows } from '../scripts/build-openings.mjs';
import { classifyGame, loadOpeningDatabase, resetOpeningDatabaseCache } from './openings.js';

const firstRows = parseOpeningRows(`${readFileSync('data/openings/a.tsv', 'utf8').split(/\r?\n/).slice(0, 5).join('\n')}\n`, 'a.tsv');
const fixtureBook = compileOpeningRows([{ eco: 'C20', name: 'King Pawn Game', sans: ['e4', 'e5'] }]);

describe('opening database lookup', () => {
  it('classifies real TSV rows to their source ECO and name', async () => {
    const book = compileOpeningRows(firstRows);
    for (const row of firstRows.slice(0, 3)) {
      const result = await classifyGame(row.sans, { database: book });
      expect(result).toMatchObject({ eco: row.eco, name: row.name });
    }
  });

  it('matches transposed move orders through their shared position key', async () => {
    const book = compileOpeningRows([{ eco: 'A00', name: 'Knight and fianchetto setup', sans: ['Nf3', 'Nf6', 'g3', 'g6'] }]);
    const first = await classifyGame(['Nf3', 'Nf6', 'g3', 'g6'], { database: book });
    const second = await classifyGame(['g3', 'g6', 'Nf3', 'Nf6'], { database: book });
    expect(first).toMatchObject({ eco: 'A00', name: 'Knight and fianchetto setup', bookPly: 4 });
    expect(second).toMatchObject({ eco: 'A00', name: 'Knight and fianchetto setup', bookPly: 4 });
  });

  it('reports the first valid ply after the deepest book match', async () => {
    const result = await classifyGame(['e4', 'e5', 'a3'], { database: fixtureBook });
    expect(result).toMatchObject({ bookPly: 2, lastBookMove: 'e5', firstOutOfBookPly: 3, firstOutOfBookMove: 'a3', lineInBook: ['e4', 'e5'] });
  });

  it('returns null for an unknown game and malformed move sequence', async () => {
    expect(await classifyGame(['a3', 'h6', 'a4'], { database: fixtureBook })).toBeNull();
    expect(await classifyGame(['e4', 'not a move'], { database: fixtureBook })).toBeNull();
  });

  it('lazy-loads the index once and clears a failed promise so a later retry works', async () => {
    resetOpeningDatabaseCache();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => fixtureBook });
    await loadOpeningDatabase(fetchImpl); await loadOpeningDatabase(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledOnce();
    resetOpeningDatabaseCache();
    const retry = vi.fn().mockResolvedValue({ ok: true, json: async () => fixtureBook });
    await loadOpeningDatabase(retry);
    expect(retry).toHaveBeenCalledOnce();
    resetOpeningDatabaseCache();
  });
});
