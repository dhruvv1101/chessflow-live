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

function timeControl(pgnHeaders) {
  const match = String(pgnHeaders.TimeControl || '').match(/^(\d+)(?:\+(\d+(?:\.\d+)?))?$/);
  return match ? { initialSeconds: Number(match[1]), incrementSeconds: Number(match[2] || 0) } : null;
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
  try { chess.loadPgn(game.pgn); } catch (error) {
    const reason = String(error?.message || 'unknown parser error').replace(/[\r\n\t]+/g, ' ').slice(0, 160);
    throw new TypeError(`PGN parse failed: ${reason}`);
  }
  const headers = Object.fromEntries(Object.entries(chess.header()).filter(([, value]) => value != null));
  const clockSettings = timeControl(headers);
  const commentsByFen = new Map();
  for (const { fen, comment } of chess.getComments()) {
    const comments = commentsByFen.get(fen) || [];
    comments.push(comment);
    commentsByFen.set(fen, comments);
  }
  const previousClock = { w: clockSettings?.initialSeconds ?? null, b: clockSettings?.initialSeconds ?? null };
  const moves = chess.history({ verbose: true }).map((move, index) => {
    const comments = commentsByFen.get(move.after) || [];
    const clock = clockFromComment(comments.shift() || '');
    const clockRemainingSeconds = clock == null ? null : parseClockSeconds(clock);
    const previous = previousClock[move.color];
    const timeSpentSeconds = !clockSettings || previous == null || clockRemainingSeconds == null ? null
      : previous + (clockSettings?.incrementSeconds || 0) - clockRemainingSeconds;
    previousClock[move.color] = clockRemainingSeconds;
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
      clock,
      timeSpentSeconds: Number.isFinite(timeSpentSeconds) && timeSpentSeconds >= 0 ? timeSpentSeconds : null,
      clockRemainingSeconds,
    };
  });
  if (!moves.length) {
    const termination = headers.Termination ? ` Termination: ${String(headers.Termination).slice(0, 80)}.` : '';
    throw Object.assign(new TypeError(`PGN has headers and a result but no moves; there is nothing to analyze.${termination}`), { code: 'NO_MOVES' });
  }
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

function parseClockSeconds(clock) {
  if (clock == null || clock === '') return null;
  const match = String(clock).trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d+))?$/);
  if (!match) return null;
  return Number(match[1] || 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(`0.${match[4] || 0}`);
}

export function buildRecentGameSet(rawGames, username, { limits = FREE_LIMITS } = {}) {
  let skippedVariants = 0;
  let skippedInvalid = 0;
  let skippedNoMoves = 0;
  const skippedGameReasons = [];
  const dropped = { variants: 0, invalidPgn: 0, noMoves: 0, missingMetadata: 0, duplicates: 0, overLimit: 0 };
  const byUrl = new Map();
  for (const raw of rawGames) {
    if (!raw || typeof raw !== 'object') { skippedInvalid += 1; dropped.invalidPgn += 1; continue; }
    if (raw.rules !== 'chess') { skippedVariants += 1; dropped.variants += 1; continue; }
    if (typeof raw.url !== 'string' || !raw.url || !Number.isFinite(Number(raw.end_time))) { dropped.missingMetadata += 1; continue; }
    if (byUrl.has(raw.url)) { dropped.duplicates += 1; continue; }
    try {
      const parsed = parseReportPgn(raw, username);
      byUrl.set(parsed.url, parsed);
    } catch (error) {
      const isNoMoves = error?.code === 'NO_MOVES';
      if (isNoMoves) { skippedNoMoves += 1; dropped.noMoves += 1; }
      else { skippedInvalid += 1; dropped.invalidPgn += 1; }
      if (skippedGameReasons.length < 25) skippedGameReasons.push({ url: String(raw.url || ''), kind: isNoMoves ? 'no-moves' : 'invalid-pgn', reason: String(error?.message || 'Unknown PGN parsing error').slice(0, 180) });
    }
  }
  const sorted = [...byUrl.values()].sort((a, b) => b.endTime - a.endTime);
  const games = sorted.slice(0, limits.maxGames);
  dropped.overLimit = Math.max(0, sorted.length - games.length);
  return { games, skippedVariants, skippedInvalid, skippedNoMoves, skippedGameReasons, dropped };
}
