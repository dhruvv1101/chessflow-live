import { Chess } from 'chess.js';

let databasePromise;

function positionKey(fen) { return fen.split(/\s+/).slice(0, 4).join(' '); }

export function loadOpeningDatabase(fetchImpl = globalThis.fetch) {
  if (!databasePromise) {
    databasePromise = fetchImpl('/data/openings.json', { cache: 'force-cache' }).then(async (response) => {
      if (!response.ok) throw new Error(`Opening data could not be loaded (${response.status}).`);
      const data = await response.json();
      if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error('Opening data has an invalid format.');
      return data;
    }).catch((error) => { databasePromise = undefined; throw error; });
  }
  return databasePromise;
}

export async function classifyGame(moves, { database, fetchImpl, startFen } = {}) {
  const book = database || await loadOpeningDatabase(fetchImpl);
  const list = Array.isArray(moves) ? moves : [];
  let board;
  try { board = new Chess(startFen || undefined); } catch { return null; }
  let deepest = null;
  const sans = [];
  let firstOutOfBookPly = null;
  for (const entry of list) {
    const san = typeof entry === 'string' ? entry : entry?.san;
    if (typeof san !== 'string') return null;
    let move;
    try { move = board.move(san); } catch { return null; }
    sans.push(move.san);
    const found = book[positionKey(board.fen())];
    if (found && typeof found.eco === 'string' && typeof found.name === 'string') deepest = { ...found, actualPly: sans.length };
    else if (deepest && firstOutOfBookPly == null) firstOutOfBookPly = sans.length;
  }
  if (!deepest) return null;
  const bookPly = deepest.actualPly;
  if (firstOutOfBookPly == null && bookPly < sans.length) firstOutOfBookPly = bookPly + 1;
  const contiguousBookPly = firstOutOfBookPly == null ? bookPly : firstOutOfBookPly - 1;
  return {
    eco: deepest.eco, name: deepest.name, bookPly,
    firstOutOfBookPly,
    lastBookMove: sans[contiguousBookPly - 1] || null,
    firstOutOfBookMove: firstOutOfBookPly ? sans[firstOutOfBookPly - 1] : null,
    lineInBook: sans.slice(0, contiguousBookPly),
  };
}

export function resetOpeningDatabaseCache() { databasePromise = undefined; }
