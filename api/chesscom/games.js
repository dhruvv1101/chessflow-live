const USERNAME = /^[A-Za-z0-9_-]{3,25}$/;
const UPSTREAM = 'https://api.chess.com/pub/player';
const MAX_BYTES = 3 * 1024 * 1024;
const requests = new Map();

function send(res, status, body, headers = {}) {
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  return res.status(status).json(body);
}

function origins(env) {
  return String(env.ALLOWED_ORIGINS || 'https://chessflow-live.vercel.app').split(',').map((value) => value.trim()).filter(Boolean);
}

function clientIp(req) {
  return String(req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'unknown').slice(0, 128);
}

function parseParams(req) {
  if (req.query) return req.query;
  return Object.fromEntries(new URL(req.url || '/', 'http://localhost').searchParams);
}

async function readBounded(response) {
  const declared = Number(response.headers?.get?.('content-length'));
  if (declared > MAX_BYTES) throw new Error('response_too_large');
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error('response_too_large');
  return text;
}

export function createReportChessComHandler({ env = process.env, fetchImpl = globalThis.fetch, now = Date.now, counters = requests, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  return async function reportChessComHandler(req, res) {
    const origin = req.headers?.origin;
    if (origin && !origins(env).includes(origin)) return send(res, 403, { error: 'origin_not_allowed' });
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(res, 405, { error: 'method_not_allowed' }); }
    const params = parseParams(req);
    const username = String(params.username || '');
    if (!USERNAME.test(username)) return send(res, 400, { error: 'invalid_username' });
    let url;
    let immutable = false;
    if (params.type === 'archives') url = `${UPSTREAM}/${encodeURIComponent(username)}/games/archives`;
    else if (params.type === 'month' && /^\d{4}$/.test(String(params.year)) && Number(params.year) >= 2000 && Number(params.year) <= new Date(now()).getUTCFullYear() + 1 && /^(?:0?[1-9]|1[0-2])$/.test(String(params.month))) {
      const year = Number(params.year);
      const month = Number(params.month);
      url = `${UPSTREAM}/${encodeURIComponent(username)}/games/${year}/${String(month).padStart(2, '0')}`;
      const date = new Date(now());
      immutable = year !== date.getUTCFullYear() || month !== date.getUTCMonth() + 1;
    } else return send(res, 400, { error: 'invalid_endpoint' });

    const time = now();
    const ip = clientIp(req);
    const recent = (counters.get(ip) || []).filter((stamp) => time - stamp < 60_000);
    if (recent.length >= 20) return send(res, 429, { error: 'rate_limited' }, { 'Retry-After': '60' });
    recent.push(time);
    counters.set(ip, recent);

    const contact = String(env.CHESSCOM_CONTACT || '').trim().slice(0, 200);
    if (!contact || /[\r\n]/.test(contact)) return send(res, 503, { error: 'service_not_configured' });
    const requestHeaders = { Accept: 'application/json', 'User-Agent': `ChessFlow Live game report (contact: ${contact})` };
    const etag = req.headers?.['if-none-match'];
    if (typeof etag === 'string' && etag.length <= 256 && !/[\r\n]/.test(etag)) requestHeaders['If-None-Match'] = etag;
    const cacheControl = `public, s-maxage=${immutable ? 31_536_000 : 43_200}, stale-while-revalidate=86400${immutable ? ', immutable' : ''}`;
    const responseHeaders = { 'Cache-Control': cacheControl };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      let upstream;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        upstream = await fetchImpl(url, { method: 'GET', headers: requestHeaders, signal: controller.signal, redirect: 'error' });
        if (upstream.status !== 429 || attempt === 2) break;
        const retryAfter = upstream.headers?.get?.('retry-after');
        const delay = Math.min(1500, Math.max(0, Number(retryAfter) * 1000 || 250 * (2 ** attempt)));
        await sleep(delay);
      }
      const upstreamEtag = upstream.headers?.get?.('etag');
      if (upstreamEtag) responseHeaders.ETag = upstreamEtag;
      if (upstream.status === 304) { res.status(304); for (const [name, value] of Object.entries(responseHeaders)) res.setHeader(name, value); return res.end(); }
      if (!upstream.ok) {
        const status = upstream.status === 404 ? 404 : upstream.status === 429 ? 429 : upstream.status === 403 ? 403 : 502;
        const retry = upstream.headers?.get?.('retry-after');
        if (status === 429 && retry && retry.length <= 128 && !/[\r\n]/.test(retry)) responseHeaders['Retry-After'] = retry;
        return send(res, status, { error: status === 404 ? 'user_not_found' : status === 429 ? 'rate_limited' : status === 403 ? 'upstream_forbidden' : 'upstream_error' }, responseHeaders);
      }
      let text;
      try { text = await readBounded(upstream); } catch (error) { return send(res, 502, { error: error.message === 'response_too_large' ? 'response_too_large' : 'upstream_error' }, responseHeaders); }
      let data;
      try { data = JSON.parse(text); } catch { return send(res, 502, { error: 'upstream_malformed' }, responseHeaders); }
      return send(res, 200, data, { ...responseHeaders, 'Content-Type': 'application/json; charset=utf-8' });
    } catch {
      return send(res, controller.signal.aborted ? 504 : 502, { error: controller.signal.aborted ? 'upstream_timeout' : 'upstream_unavailable' }, responseHeaders);
    } finally { clearTimeout(timer); }
  };
}

export default createReportChessComHandler();
