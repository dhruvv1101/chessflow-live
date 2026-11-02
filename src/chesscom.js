import { Chess } from 'chess.js';

export const CHESSCOM_USERNAME_PATTERN = /^[a-zA-Z0-9_-]{2,30}$/;
const API_ORIGIN = 'https://api.chess.com/pub/player';
const cache = new Map();
const mode = import.meta.env.VITE_CHESSCOM_MODE === 'direct' ? 'direct' : 'proxy';

export function parseChessComUsername(input) {
  const value = String(input || '').trim();
  const match = value.match(/^(?:https?:\/\/)?(?:www\.)?chess\.com\/member\/([^/?#]+)\/?(?:[?#].*)?$/i);
  let username = value;
  try { username = (match ? decodeURIComponent(match[1]) : value).trim(); } catch { throw new TypeError('Enter a valid Chess.com username or member profile URL.'); }
  if (!CHESSCOM_USERNAME_PATTERN.test(username)) throw new TypeError('Enter a valid Chess.com username or member profile URL.');
  return username;
}

export function detectPlayerColor(game, username) {
  const normalized = String(username || '').toLocaleLowerCase();
  if (String(game?.white?.username || '').toLocaleLowerCase() === normalized) return 'white';
  if (String(game?.black?.username || '').toLocaleLowerCase() === normalized) return 'black';
  return null;
}

export function resultFromMyView(game, color) {
  if (!color) return 'unknown';
  const mine = game?.[color]?.result;
  if (mine === 'win') return 'win';
  if (['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient', 'draw'].includes(mine)) return 'draw';
  const opponent = game?.[color === 'white' ? 'black' : 'white']?.result;
  if (opponent === 'win') return 'loss';
  if (['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient', 'draw'].includes(opponent)) return 'draw';
  return 'unknown';
}

export function enrichChessComGame(game, username) {
  const color = detectPlayerColor(game, username);
  const opponent = color ? game[color === 'white' ? 'black' : 'white'] : null;
  let headers = {};
  let moveCount = 0;
  try { const chess = new Chess(); chess.loadPgn(String(game.pgn || '')); headers = chess.header(); moveCount = chess.history().length; } catch { /* the review path reports malformed PGNs with its existing validation */ }
  return {
    ...game, color, opponentName: String(opponent?.username || 'Unknown opponent'),
    myResult: resultFromMyView(game, color), moveCount,
    accuracy: color ? game.accuracies?.[color] ?? null : null,
    opponentAccuracy: color ? game.accuracies?.[color === 'white' ? 'black' : 'white'] ?? null : null,
    eco: headers.ECO || '', opening: headers.Opening || headers.ECOUrl?.split('/').pop()?.replaceAll('-', ' ') || '',
    date: Number.isFinite(game.end_time) ? new Date(game.end_time * 1000) : null,
  };
}

export function filterChessComGames(games, filters = {}) {
  const search = String(filters.opponent || '').trim().toLocaleLowerCase();
  return games.filter((game) => (!filters.timeClass || game.time_class === filters.timeClass)
    && (!filters.color || game.color === filters.color)
    && (!filters.result || game.myResult === filters.result)
    && (!filters.month || game.archiveMonth === filters.month)
    && (!search || game.opponentName.toLocaleLowerCase().includes(search)));
}

function cacheKey(url) { return `chessflow.chesscom:${url}`; }
function currentMonthKey() { const now = new Date(); return `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`; }

function readCached(url) {
  if (cache.has(url)) return cache.get(url);
  try { const value = JSON.parse(sessionStorage.getItem(cacheKey(url)) || 'null'); if (value?.data) { cache.set(url, value); return value; } } catch { /* session cache is optional */ }
  return null;
}

function writeCached(url, value, immutable) {
  cache.set(url, value);
  if (!immutable) return;
  try { sessionStorage.setItem(cacheKey(url), JSON.stringify(value)); } catch { /* session cache is optional */ }
}

function upstreamUrl(username, type, year, month) {
  if (type === 'archives') return `${API_ORIGIN}/${encodeURIComponent(username)}/games/archives`;
  return `${API_ORIGIN}/${encodeURIComponent(username)}/games/${year}/${String(month).padStart(2, '0')}`;
}

function requestUrl(username, type, year, month) {
  if (mode === 'direct') return upstreamUrl(username, type, year, month);
  const query = new URLSearchParams({ username, type });
  if (type === 'month') { query.set('year', String(year)); query.set('month', String(month).padStart(2, '0')); }
  return `/api/chesscom?${query}`;
}

function errorForStatus(status) {
  if (status === 404) return new Error('Chess.com user not found. Check the username and try again.');
  if (status === 429) return new Error('Chess.com is rate limiting requests. Wait a little before trying again.');
  if (status === 403) return new Error('Chess.com blocked this request. Try again later.');
  if (status === 503) return new Error('Chess.com import is not configured on this server yet.');
  return new Error('Could not load public Chess.com games. Please try again later.');
}

async function readJsonLimited(response, maxBytes = 3 * 1024 * 1024) {
  const length = Number(response.headers?.get?.('content-length'));
  if (length > maxBytes) throw new Error('Chess.com returned too much data for one request.');
  const text = await response.text();
  if (text.length > maxBytes) throw new Error('Chess.com returned too much data for one request.');
  try { return JSON.parse(text); } catch { throw new Error('Chess.com returned malformed data.'); }
}

export class ChessComClient {
  constructor({ fetchImpl = globalThis.fetch, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), timeoutMs = 10_000, retries = 2 } = {}) {
    this.fetchImpl = fetchImpl; this.wait = wait; this.timeoutMs = timeoutMs; this.retries = retries; this.queue = Promise.resolve();
  }

  getArchives(username, options = {}) {
    const valid = parseChessComUsername(username); const url = requestUrl(valid, 'archives');
    return this.#enqueue(() => this.#get(url, false, options)).then((data) => {
      if (!Array.isArray(data?.archives) || data.archives.some((entry) => typeof entry !== 'string')) throw new Error('Chess.com returned malformed archive data.');
      return data.archives.slice().sort((a, b) => b.localeCompare(a));
    });
  }

  getMonth(username, year, month, options = {}) {
    const valid = parseChessComUsername(username);
    const yearNumber = Number(year); const monthNumber = Number(month);
    if (!Number.isInteger(yearNumber) || yearNumber < 2000 || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) return Promise.reject(new TypeError('Invalid archive month.'));
    const url = requestUrl(valid, 'month', yearNumber, monthNumber);
    const immutable = `${yearNumber}/${String(monthNumber).padStart(2, '0')}` !== currentMonthKey();
    return this.#enqueue(() => this.#get(url, immutable, options)).then((data) => {
      if (!Array.isArray(data?.games)) throw new Error('Chess.com returned malformed monthly game data.');
      if (data.games.some((game) => !game || typeof game.pgn !== 'string' || typeof game.rules !== 'string')) throw new Error('Chess.com returned malformed monthly game data.');
      const variants = data.games.filter((game) => game.rules !== 'chess').length;
      const games = data.games.filter((game) => game.rules === 'chess').map((game) => ({ ...game, archiveMonth: `${yearNumber}/${String(monthNumber).padStart(2, '0')}` }));
      games.sort((a, b) => (Number(b.end_time) || 0) - (Number(a.end_time) || 0));
      return { games, skippedVariants: variants };
    });
  }

  #enqueue(action) {
    const result = this.queue.then(action, action);
    this.queue = result.catch(() => {});
    return result;
  }

  async #get(url, immutable, { signal } = {}) {
    const cached = readCached(url);
    let attempt = 0;
    while (true) {
      if (signal?.aborted) throw new DOMException('Import cancelled.', 'AbortError');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new DOMException('Chess.com request timed out.', 'TimeoutError')), this.timeoutMs);
      const abort = () => controller.abort(signal.reason || new DOMException('Import cancelled.', 'AbortError'));
      signal?.addEventListener('abort', abort, { once: true });
      try {
        const response = await this.fetchImpl(url, { method: 'GET', headers: cached?.etag ? { 'If-None-Match': cached.etag } : {}, signal: controller.signal });
        if (response.status === 304 && cached) return cached.data;
        if (response.status === 429 && attempt < this.retries) {
          attempt += 1;
          const retryHeader = response.headers?.get?.('retry-after');
          const retrySeconds = Number(retryHeader);
          const retryDate = retryHeader && !Number.isFinite(retrySeconds) ? Date.parse(retryHeader) : NaN;
          const delay = Number.isFinite(retrySeconds) && retrySeconds > 0
            ? retrySeconds * 1000
            : Number.isFinite(retryDate) ? Math.max(0, retryDate - Date.now()) : attempt * 500;
          clearTimeout(timer);
          if (signal) {
            let onAbort;
            try {
              await Promise.race([
                this.wait(delay),
                new Promise((_, reject) => {
                  onAbort = () => reject(new DOMException('Import cancelled.', 'AbortError'));
                  signal.addEventListener('abort', onAbort, { once: true });
                }),
              ]);
            } finally { if (onAbort) signal.removeEventListener('abort', onAbort); }
          } else await this.wait(delay);
          continue;
        }
        if (!response.ok) throw errorForStatus(response.status);
        const data = await readJsonLimited(response);
        writeCached(url, { etag: response.headers?.get?.('etag') || '', data }, immutable);
        return data;
      } catch (error) {
        if (signal?.aborted) throw new DOMException('Import cancelled.', 'AbortError');
        if (controller.signal.aborted) throw new DOMException('Chess.com request timed out.', 'TimeoutError');
        if (error.name === 'AbortError' || error.name === 'TimeoutError') throw error;
        if (error instanceof TypeError && /fetch|network/i.test(error.message)) throw new Error('Could not reach Chess.com. Check your network and try again.');
        throw error;
      } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
    }
  }
}

export function clearChessComMemoryCache() { cache.clear(); }
