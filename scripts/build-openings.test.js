import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { compileOpeningRows, parseOpeningRows } from './build-openings.mjs';

describe('opening index builder', () => {
  it('rejects malformed TSV rows with their source line number', () => {
    expect(() => parseOpeningRows('eco\tname\tpgn\nA00\t\t1. e4', 'broken.tsv')).toThrow('broken.tsv:2: malformed opening row.');
    expect(() => parseOpeningRows('eco\tname\tpgn\nA00\tBad line\t1. e5', 'broken.tsv')).toThrow('invalid opening PGN');
  });

  it('keeps the shortest line when multiple rows reach the same position key', () => {
    const database = compileOpeningRows([
      { eco: 'A00', name: 'Long transposition', sans: ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'g3', 'g6'] },
      { eco: 'B00', name: 'Short transposition', sans: ['Nf3', 'Nf6', 'g3', 'g6'] },
    ]);
    const target = new Chess();
    for (const san of ['Nf3', 'Nf6', 'g3', 'g6']) target.move(san);
    const key = target.fen().split(/\s+/).slice(0, 4).join(' ');
    expect(database[key]).toEqual({ eco: 'B00', name: 'Short transposition', plyCount: 4 });
  });
});
