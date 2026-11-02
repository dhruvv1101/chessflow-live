import { FREE_LIMITS } from './config.js';
import { buildRecentGameSet, parseReportUsername } from './chesscom.js';

const cacheControl = new Map();

function friendlyHttpError(status) {
  if (status === 404) return new Error('Chess.com user not found. Check the username and try again.');
  if (status === 429) return new Error('Chess.com is rate limiting requests. Wait a little before trying again.');
  if (status === 403) return new Error('Chess.com blocked this request. Try again later.');
  if (status === 503) return new Error('Chess.com import is not configured: CHESSCOM_CONTACT is missing from this Vercel deployment. Set the server-only variable in this environment and redeploy.');
  if (status >= 500) return new Error('Chess.com is temporarily unavailable. Try again later.');
  return new Error('Chess.com returned an unexpected response.');
}

function retryDelay(value, attempt) {
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(10_000, seconds * 1000);
  const date = Date.parse(value || '');
  if (Number.isFinite(date)) return Math.min(10_000, Math.max(0, date - Date.now()));
  return 500 * (2 ** attempt);
}

function monthFromArchive(url) {
  const match = String(url).match(/\/(\d{4})\/(\d{1,2})\/?$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 2000 || month < 1 || month > 12) return null;
  return { year, month, key: `${year}/${String(month).padStart(2, '0')}` };
}

function archiveMonths(archives) {
  const unique = new Map();
  for (const month of archives.map(monthFromArchive).filter(Boolean)) unique.set(month.key, month);
  return [...unique.values()].sort((a, b) => b.year - a.year || b.month - a.month);
}

export function createReportChessComClient({ fetchImpl = (...args) => globalThis.fetch(...args), sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), timeoutMs = 10_000, retries = 2 } = {}) {
  const cache = new Map();
  let queue = Promise.resolve();

  const request = async (query, signal) => {
    const url = `/api/chesscom/games?${new URLSearchParams(query)}`;
    const cached = cache.get(url);
    let attempt = 0;
    while (true) {
      if (signal?.aborted) throw new DOMException('Import cancelled.', 'AbortError');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(new DOMException('Chess.com request timed out.', 'TimeoutError')), timeoutMs);
      const abortFromCaller = () => controller.abort(signal.reason || new DOMException('Import cancelled.', 'AbortError'));
      signal?.addEventListener('abort', abortFromCaller, { once: true });
      try {
        const headers = { Accept: 'application/json' };
        if (cached?.etag) headers['If-None-Match'] = cached.etag;
        const response = await fetchImpl(url, { method: 'GET', headers, signal: controller.signal });
        if (response.status === 304) {
          if (!cached) throw new Error('Chess.com returned a cache response without saved data.');
          return cached.data;
        }
        if (response.status === 429 && attempt < retries) {
          await sleep(retryDelay(response.headers.get('retry-after'), attempt));
          attempt += 1;
          continue;
        }
        if (!response.ok) throw friendlyHttpError(response.status);
        const contentLength = Number(response.headers.get('content-length'));
        if (contentLength > 3 * 1024 * 1024) throw new Error('Chess.com returned too much data for one request.');
        const text = await response.text();
        if (new TextEncoder().encode(text).byteLength > 3 * 1024 * 1024) throw new Error('Chess.com returned too much data for one request.');
        let data;
        try { data = JSON.parse(text); } catch { throw new Error('Chess.com returned malformed data.'); }
        cache.set(url, { etag: response.headers.get('etag'), data });
        return data;
      } catch (error) {
        if (error?.name === 'AbortError' && signal?.aborted) throw error;
        if (controller.signal.aborted && !signal?.aborted) throw new Error('Chess.com request timed out. Try again.');
        if (/Chess\.com /.test(error?.message || '') || error instanceof TypeError && /too much|malformed/.test(error.message)) throw error;
        if (error instanceof TypeError && error.message.startsWith('Chess.com')) throw error;
        throw new Error('Could not reach Chess.com. Check your network and try again.');
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abortFromCaller);
      }
    }
  };

  const enqueue = (work) => {
    const result = queue.then(work, work);
    queue = result.catch(() => {});
    return result;
  };

  return {
    getArchives(username, { signal } = {}) {
      const valid = parseReportUsername(username);
      return enqueue(async () => {
        const data = await request({ username: valid, type: 'archives' }, signal);
        if (!Array.isArray(data?.archives) || data.archives.some((entry) => typeof entry !== 'string')) throw new Error('Chess.com returned malformed archive data.');
        return data.archives.slice().sort((a, b) => b.localeCompare(a));
      });
    },
    getMonth(username, year, month, { signal } = {}) {
      const valid = parseReportUsername(username);
      const yearNumber = Number(year);
      const monthNumber = Number(month);
      if (!Number.isInteger(yearNumber) || yearNumber < 2000 || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) return Promise.reject(new TypeError('Invalid archive month.'));
      return enqueue(async () => {
        const data = await request({ username: valid, type: 'month', year: yearNumber, month: String(monthNumber).padStart(2, '0') }, signal);
        if (!Array.isArray(data?.games)) throw new Error('Chess.com returned malformed monthly game data.');
        return data.games;
      });
    },
    importRecentGames(username, { maxGames = FREE_LIMITS.maxGames, signal, onProgress = () => {} } = {}) {
      const valid = parseReportUsername(username);
      return enqueue(async () => {
        onProgress({ stage: 'archives', completed: 0, total: 0, message: 'Finding your recent game archives…' });
        const data = await request({ username: valid, type: 'archives' }, signal);
        if (!Array.isArray(data?.archives) || data.archives.some((entry) => typeof entry !== 'string')) throw new Error('Chess.com returned malformed archive data.');
        const months = archiveMonths(data.archives);
        const rawGames = [];
        let skippedVariants = 0;
        let monthsFetched = 0;
        let gamesFetched = 0;
        for (const month of months) {
          if (signal?.aborted) throw new DOMException('Import cancelled.', 'AbortError');
          onProgress({ stage: 'games', completed: monthsFetched, total: months.length, message: `Loading archive ${monthsFetched + 1} of ${months.length}…` });
          const monthly = await request({ username: valid, type: 'month', year: month.year, month: String(month.month).padStart(2, '0') }, signal);
          if (!Array.isArray(monthly?.games)) throw new Error('Chess.com returned malformed monthly game data.');
          for (const game of monthly.games) {
            if (!game || typeof game.pgn !== 'string' || typeof game.rules !== 'string') throw new Error('Chess.com returned malformed game data.');
            gamesFetched += 1;
            if (game.rules !== 'chess') { skippedVariants += 1; continue; }
            rawGames.push(game);
          }
          monthsFetched += 1;
          onProgress({ stage: 'games', completed: monthsFetched, total: months.length, message: `Loaded ${monthsFetched} of ${months.length} archives…` });
          if (buildRecentGameSet(rawGames, valid, { limits: { maxGames } }).games.length >= maxGames) break;
        }
        const result = buildRecentGameSet(rawGames, valid, { limits: { maxGames } });
        result.skippedVariants += skippedVariants;
        result.dropped.variants += skippedVariants;
        result.archiveMonthsFound = data.archives.length;
        result.archiveMonthsFetched = monthsFetched;
        result.archiveMonthsNotFetched = Math.max(0, months.length - monthsFetched);
        result.gamesFetched = gamesFetched;
        result.monthsFetched = monthsFetched;
        onProgress({ stage: 'done', completed: monthsFetched, total: months.length, message: `Imported ${result.games.length} of up to ${maxGames} most recent standard games.` });
        return result;
      });
    },
  };
}

export const reportChessComClient = createReportChessComClient();
