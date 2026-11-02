const USERNAME = /^[A-Za-z0-9_-]{2,30}$/;
const UPSTREAM = 'https://api.chess.com/pub/player';
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const MAX_BODY_BYTES = 3 * 1024 * 1024;
const ipRequests = new Map();

function send(res, status, body, headers = {}) {
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  return res.status(status).json(body);
}

function allowedOrigins(env) { return String(env.ALLOWED_ORIGINS || 'https://chessflow-live.vercel.app').split(',').map((origin) => origin.trim()).filter(Boolean); }

function clientIp(req) {
  return req.headers?.['x-real-ip'] || req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
}

async function readResponseLimited(upstream) {
  if (upstream.body?.getReader) {
    const reader = upstream.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new Error('response_too_large'); }
      chunks.push(value);
    }
    const joined = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder().decode(joined);
  }
  const text = await upstream.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) throw new Error('response_too_large');
  return text;
}

export function createChessComHandler({ env = process.env, fetchImpl = globalThis.fetch, now = Date.now, counters = ipRequests } = {}) {
  return async function chessComHandler(req, res) {
    const origin = req.headers?.origin;
    if (origin && !allowedOrigins(env).includes(origin)) return send(res, 403, { error: 'origin_not_allowed' });
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(res, 405, { error: 'method_not_allowed' }); }

    const params = req.query || Object.fromEntries(new URL(req.url || '/', 'http://localhost').searchParams);
    const username = String(params.username || '');
    const type = params.type;
    if (!USERNAME.test(username)) return send(res, 400, { error: 'invalid_username' });
    let url;
    if (type === 'archives') url = `${UPSTREAM}/${encodeURIComponent(username)}/games/archives`;
    else if (type === 'month' && /^\d{4}$/.test(String(params.year)) && Number(params.year) >= 2000 && Number(params.year) <= new Date(now()).getUTCFullYear() + 1 && /^(?:0?[1-9]|1[0-2])$/.test(String(params.month))) {
      url = `${UPSTREAM}/${encodeURIComponent(username)}/games/${Number(params.year)}/${String(Number(params.month)).padStart(2, '0')}`;
    } else return send(res, 400, { error: 'invalid_endpoint' });

    const time = now();
    const ip = clientIp(req);
    const recent = (counters.get(ip) || []).filter((timestamp) => time - timestamp < WINDOW_MS);
    if (recent.length >= MAX_PER_WINDOW) return send(res, 429, { error: 'rate_limited' }, { 'Retry-After': '60' });
    recent.push(time); counters.set(ip, recent);
    if (counters.size > 5000) for (const [knownIp, timestamps] of counters) {
      if (!timestamps.some((timestamp) => time - timestamp < WINDOW_MS)) counters.delete(knownIp);
    }

    const contact = String(env.CHESSCOM_CONTACT || '').trim().slice(0, 200);
    if (!contact || /[\r\n]/.test(contact)) return send(res, 503, { error: 'service_not_configured' });
    const headers = { 'User-Agent': `ChessFlow Live public-game importer (contact: ${contact})`, Accept: 'application/json' };
    const etag = req.headers?.['if-none-match'];
    if (typeof etag === 'string' && etag.length <= 256) headers['If-None-Match'] = etag;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const upstream = await fetchImpl(url, { method: 'GET', headers, signal: controller.signal, redirect: 'error' });
      const current = new Date(now());
      const monthKey = `${Number(params.year)}/${String(Number(params.month)).padStart(2, '0')}`;
      const currentKey = `${current.getUTCFullYear()}/${String(current.getUTCMonth() + 1).padStart(2, '0')}`;
      const immutable = type === 'month' && monthKey !== currentKey;
      const responseHeaders = { 'Cache-Control': type === 'archives' ? 'public, s-maxage=300, stale-while-revalidate=600' : immutable ? 'public, s-maxage=86400, immutable' : 'public, s-maxage=300, stale-while-revalidate=600' };
      const upstreamEtag = upstream.headers?.get?.('etag');
      if (upstreamEtag) responseHeaders.ETag = upstreamEtag;
      if (upstream.status === 304) { res.status(304); for (const [name, value] of Object.entries(responseHeaders)) res.setHeader(name, value); return res.end(); }
      if (!upstream.ok) {
        const mapped = upstream.status === 404 ? 404 : upstream.status === 429 ? 429 : upstream.status === 403 ? 403 : 502;
        const retryAfter = mapped === 429 ? upstream.headers?.get?.('retry-after') : null;
        if (retryAfter && retryAfter.length <= 128 && !/[\r\n]/.test(retryAfter)) responseHeaders['Retry-After'] = retryAfter;
        return send(res, mapped, { error: mapped === 404 ? 'user_not_found' : mapped === 429 ? 'rate_limited' : mapped === 403 ? 'upstream_forbidden' : 'upstream_error' }, responseHeaders);
      }
      const length = Number(upstream.headers?.get?.('content-length'));
      if (length > MAX_BODY_BYTES) return send(res, 502, { error: 'response_too_large' });
      let text;
      try { text = await readResponseLimited(upstream); }
      catch (error) { if (error.message === 'response_too_large') return send(res, 502, { error: 'response_too_large' }); throw error; }
      let payload;
      try { payload = JSON.parse(text); } catch { return send(res, 502, { error: 'upstream_malformed' }); }
      return send(res, 200, payload, { ...responseHeaders, 'Content-Type': 'application/json; charset=utf-8' });
    } catch (error) {
      return send(res, controller.signal.aborted ? 504 : 502, { error: controller.signal.aborted ? 'upstream_timeout' : 'upstream_unavailable' });
    } finally { clearTimeout(timer); }
  };
}

export default createChessComHandler();
