import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Chess } from 'chess.js';

const DATA_FILES = ['a.tsv', 'b.tsv', 'c.tsv', 'd.tsv', 'e.tsv'];

function positionKey(fen) { return fen.split(/\s+/).slice(0, 4).join(' '); }

export function parseOpeningRows(content, filename = '<input>') {
  const lines = String(content).replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (!lines.length || lines[0] !== 'eco\tname\tpgn') throw new Error(`${filename}: expected eco, name, pgn header.`);
  return lines.slice(1).map((line, index) => {
    const fields = line.split('\t');
    if (fields.length !== 3 || !/^[A-E]\d{2}$/.test(fields[0]) || !fields[1].trim() || !fields[2].trim()) throw new Error(`${filename}:${index + 2}: malformed opening row.`);
    const [eco, name, pgn] = fields;
    const parsed = new Chess();
    try { parsed.loadPgn(pgn); } catch (error) { throw new Error(`${filename}:${index + 2}: invalid opening PGN (${error.message}).`); }
    if (!parsed.history().length) throw new Error(`${filename}:${index + 2}: opening PGN has no moves.`);
    return { eco, name, pgn, sans: parsed.history() };
  });
}

export function compileOpeningRows(rows) {
  const database = {};
  for (const row of rows) {
    const board = new Chess();
    for (const [index, san] of row.sans.entries()) {
      let move;
      try { move = board.move(san); } catch (error) { throw new Error(`${row.name}: could not replay ${san} (${error.message}).`); }
      const key = positionKey(board.fen());
      const candidate = { eco: row.eco, name: row.name, plyCount: index + 1 };
      const existing = database[key];
      if (!existing || candidate.plyCount < existing.plyCount) database[key] = candidate;
    }
  }
  return database;
}

export async function buildOpenings({ dataDir = resolve('data/openings'), outputPath = resolve('public/data/openings.json') } = {}) {
  const rows = [];
  for (const filename of DATA_FILES) rows.push(...parseOpeningRows(await readFile(join(dataDir, filename), 'utf8'), filename));
  const json = `${JSON.stringify(compileOpeningRows(rows))}\n`;
  await mkdir(resolve(outputPath, '..'), { recursive: true });
  await writeFile(outputPath, json, 'utf8');
  return { entries: Object.keys(JSON.parse(json)).length, rawBytes: Buffer.byteLength(json), gzipBytes: gzipSync(json).byteLength, rows: rows.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await buildOpenings();
    console.log(`Built ${result.entries} opening positions from ${result.rows} rows; ${result.rawBytes} bytes raw, ${result.gzipBytes} bytes gzip.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
