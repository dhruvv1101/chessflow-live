import { Chess } from 'chess.js';

export function makeLegalMove(chess, move) {
  try { return chess.move(move); } catch { return null; }
}

export function getMoveList(chess) {
  const sans = chess.history();
  const rows = [];
  for (let i = 0; i < sans.length; i += 2) {
    rows.push(`${Math.floor(i / 2) + 1}. ${sans[i]}${sans[i + 1] ? ` ${sans[i + 1]}` : ''}`);
  }
  return rows;
}

export function getGameStatus(chess) {
  if (chess.isCheckmate()) return { kind: 'checkmate', winner: chess.turn() === 'w' ? 'Black' : 'White' };
  if (chess.isStalemate()) return { kind: 'stalemate' };
  if (chess.isThreefoldRepetition()) return { kind: 'draw', reason: 'Threefold repetition' };
  if (chess.isInsufficientMaterial()) return { kind: 'draw', reason: 'Insufficient material' };
  if (chess.isDraw()) return { kind: 'draw', reason: 'Draw by rule' };
  return chess.isCheck() ? { kind: 'check', side: chess.turn() } : { kind: 'playing' };
}

export function toWhiteScore(score, activeColor) {
  const sign = activeColor === 'b' ? -1 : 1;
  return {
    cp: score.cp == null ? null : score.cp * sign,
    mate: score.mate == null ? null : score.mate * sign,
  };
}

export function formatEvaluation(score) {
  if (score.mate != null) return score.mate > 0 ? `White mates in ${score.mate}` : `Black mates in ${Math.abs(score.mate)}`;
  if (score.cp == null) return '—';
  return `${score.cp > 0 ? '+' : ''}${(score.cp / 100).toFixed(2)}`;
}

export function uciToSan(fen, uci) {
  if (!uci || uci.length < 4) return uci || '—';
  try {
    const game = new Chess(fen);
    return game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci[4] ? { promotion: uci[4] } : {}) }).san;
  } catch { return uci; }
}

export function uciLineToSan(fen, line) {
  try {
    const game = new Chess(fen);
    return line.map((uci) => game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci[4] ? { promotion: uci[4] } : {}) }).san);
  } catch { return line; }
}

export function promotionPiece(color, type) {
  const pieces = { q: '♛', r: '♜', b: '♝', n: '♞' };
  return color === 'w' ? pieces[type].replace('♛', '♕').replace('♜', '♖').replace('♝', '♗').replace('♞', '♘') : pieces[type];
}

export function pieceName(piece) {
  return ({ q: 'queen', r: 'rook', b: 'bishop', n: 'knight' })[piece];
}
