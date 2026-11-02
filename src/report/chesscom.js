import { Chess } from 'chess.js';
import { FREE_LIMITS } from './config.js';

export const REPORT_USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,25}$/;

export function parseReportUsername(value) {
  const username = String(value || '').trim();
  if (!REPORT_USERNAME_PATTERN.test(username)) throw new TypeError('Enter a valid Chess.com username (3–25 letters, numbers, underscores or hyphens).');
  return username;
}

function clockFromComment(comment = '') {
  return String(comment).match(/\[%clk\s+([^\]]+)\]/i)?.[1]?.trim() || null;
}

function userColorFrom(game, username, headers) {
  const normalized = username.toLocaleLowerCase();
  if (String(game.white?.username || '').toLocaleLowerCase() === normalized || String(headers.White || '').toLocaleLowerCase() === normalized) return 'white';
  if (String(game.black?.username || '').toLocaleLowerCase() === normalized || String(headers.Black || '').toLocaleLowerCase() === normalized) return 'black';
  return null;
}

export function parseReportPgn(game, username) {
  if (!game || typeof game.pgn !== 'string' || !game.pgn.trim()) throw new TypeError('Chess.com returned a game without PGN.');
  const player = parseReportUsername(username);
  const chess = new Chess();
  try { chess.loadPgn(game.pgn); } catch { throw new TypeError('Chess.com returned a PGN that could not be parsed.'); }
  const headers = Object.fromEntries(Object.entries(chess.header()).filter(([, value]) => value != null));
  const commentsByFen = new Map();
  for (const { fen, comment } of chess.getComments()) {
    const comments = commentsByFen.get(fen) || [];
    comments.push(comment);
    commentsByFen.set(fen, comments);
  }
  const moves = chess.history({ verbose: true }).map((move, index) => {
    const comments = commentsByFen.get(move.after) || [];
    return {
      ply: index + 1,
      color: move.color,
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion || ''}`,
      from: move.from,
      to: move.to,
      promotion: move.promotion || null,
      fenBefore: move.before,
      fenAfter: move.after,
      clock: clockFromComment(comments.shift() || ''),
    };
  });
  if (!moves.length) throw new TypeError('Chess.com returned a game with no moves.');
  const headersResult = headers.Result;
  const endTime = Number(game.end_time);
  return {
    url: String(game.url || ''),
    pgn: game.pgn,
    headers,
    userColor: userColorFrom(game, player, headers),
    result: headersResult || '*',
    timeClass: String(game.time_class || headers.TimeControl || 'unknown'),
    eco: String(headers.ECO || game.eco || ''),
    opening: String(headers.Opening || game.opening || ''),
    endTime: Number.isFinite(endTime) ? endTime * 1000 : 0,
    moves,
  };
}

export function buildRecentGameSet(rawGames, username, { now = Date.now(), limits = FREE_LIMITS } = {}) {
  let skippedVariants = 0;
  let skippedInvalid = 0;
  const dropped = { variants: 0, invalidPgn: 0, missingMetadata: 0, outsideDateRange: 0, duplicates: 0, overLimit: 0 };
  const cutoff = now - limits.lookbackDays * 24 * 60 * 60 * 1000;
  const byUrl = new Map();
  for (const raw of rawGames) {
    if (!raw || typeof raw !== 'object') { skippedInvalid += 1; dropped.invalidPgn += 1; continue; }
    if (raw.rules !== 'chess') { skippedVariants += 1; dropped.variants += 1; continue; }
    if (typeof raw.url !== 'string' || !raw.url || !Number.isFinite(Number(raw.end_time))) { dropped.missingMetadata += 1; continue; }
    const endTime = Number(raw.end_time) * 1000;
    if (endTime < cutoff || endTime > now + 60_000) { dropped.outsideDateRange += 1; continue; }
    if (byUrl.has(raw.url)) { dropped.duplicates += 1; continue; }
    try {
      const parsed = parseReportPgn(raw, username);
      byUrl.set(parsed.url, parsed);
    } catch { skippedInvalid += 1; dropped.invalidPgn += 1; }
  }
  const sorted = [...byUrl.values()].sort((a, b) => b.endTime - a.endTime);
  const games = sorted.slice(0, limits.maxGames);
  dropped.overLimit = Math.max(0, sorted.length - games.length);
  return { games, skippedVariants, skippedInvalid, dropped };
}
