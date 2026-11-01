import { Chess } from 'chess.js';

const STANDARD_FEN = new Chess().fen();
const VALID_RESULTS = new Set(['1-0', '0-1', '1/2-1/2', '*']);

export function escapePgnHeader(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ');
}

function pgnDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return '????.??.??';
  return `${date.getUTCFullYear()}.${String(date.getUTCMonth() + 1).padStart(2, '0')}.${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function buildGamePgn(chess, { startFen = STANDARD_FEN, date = new Date(), white = 'You', black = 'Stockfish', result = '*' } = {}) {
  if (!chess || typeof chess.history !== 'function') throw new TypeError('A chess.js game is required.');
  if (!VALID_RESULTS.has(result)) throw new TypeError('Invalid PGN result.');
  const initial = new Chess(startFen || undefined);
  const output = new Chess(initial.fen());
  for (const move of chess.history({ verbose: true })) {
    const legal = output.move({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) });
    if (!legal) throw new Error(`Could not build PGN at ${move.from}${move.to}.`);
  }
  const headers = [
    'Event', 'ChessFlow Live game',
    'Site', 'chessflow-live',
    'Date', pgnDate(date),
    'Round', '-',
    'White', white,
    'Black', black,
    'Result', result,
  ];
  if (initial.fen() !== STANDARD_FEN) headers.push('SetUp', '1', 'FEN', initial.fen());
  output.header(...headers);
  const generated = output.pgn({ maxWidth: 0 });
  const movetext = generated.split(/\r?\n\r?\n/).at(-1) || '*';
  const escapedHeaders = [];
  for (let index = 0; index < headers.length; index += 2) escapedHeaders.push(`[${headers[index]} "${escapePgnHeader(headers[index + 1])}"]`);
  return `${escapedHeaders.join('\n')}\n\n${movetext}`;
}

export function resultForGame({ status, resigned = false, localOutcome = '', resignedColor = null } = {}) {
  if (status?.kind === 'checkmate') return status.winner === 'White' ? '1-0' : '0-1';
  if (status?.kind === 'stalemate' || status?.kind === 'draw' || localOutcome === 'draw' || localOutcome === 'flag-draw') return '1/2-1/2';
  if (resigned && resignedColor === 'w') return '0-1';
  if (resigned && resignedColor === 'b') return '1-0';
  return '*';
}
