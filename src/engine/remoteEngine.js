import { Chess } from 'chess.js';

const baseUrl = (import.meta.env.VITE_ENGINE_API_URL || '').replace(/\/+$/, '');
let healthPromise;

export function resetRemoteHealthCache() { healthPromise = undefined; }

async function checkHealth(fetchImpl, signal, apiUrl) {
  if (!apiUrl) throw new Error('VITE_ENGINE_API_URL is not configured.');
  if (!healthPromise) healthPromise = fetchImpl(`${apiUrl}/health`, { signal }).then(async (response) => {
    if (!response.ok) throw new Error(`Server health check failed (${response.status}).`);
    const body = await response.json();
    if (body?.ok !== true || typeof body.engine !== 'string') throw new Error('Server health response is invalid.');
    return body;
  }).catch((error) => { healthPromise = undefined; throw error; });
  return healthPromise;
}

export async function analyzeRemote(fen, { movetime = 4000, multipv = 3, skill = 20, depth = null,
  positionId, getPositionId = () => positionId, fetchImpl = globalThis.fetch, apiUrl = baseUrl } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Server engine timed out.', 'TimeoutError')), movetime + 4000);
  try {
    const health = await checkHealth(fetchImpl, controller.signal, apiUrl);
    const response = await fetchImpl(`${apiUrl}/analyze`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ fen, movetime_ms: movetime, depth, multipv, skill }),
    });
    if (!response.ok) {
      const error = new Error(response.status === 503 ? 'Analysis server is busy.' : `Analysis server returned ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    let data;
    try { data = await response.json(); } catch { throw new Error('Analysis server returned invalid JSON.'); }
    if (getPositionId() !== positionId) throw new DOMException('Stale analysis result.', 'AbortError');
    if (!Array.isArray(data?.lines) || typeof data.best_uci !== 'string') throw new Error('Analysis server response is incomplete.');
    const turn = fen.split(/\s+/)[1] || 'w';
    const lines = data.lines.map((line) => {
      const pvSan = Array.isArray(line.pv_san) ? line.pv_san : typeof line.pv_san === 'string' ? line.pv_san.trim().split(/\s+/).filter(Boolean) : [];
      const pvUci = Array.isArray(line.pv_uci) ? line.pv_uci : typeof line.pv_uci === 'string' ? line.pv_uci.trim().split(/\s+/).filter(Boolean) : null;
      const pv = pvUci || sanToUciLine(fen, pvSan);
      return { rank: line.rank, move: line.uci, cp: line.cp_white, mate: line.mate_white,
        sideCp: line.cp_white == null ? null : (turn === 'b' ? -line.cp_white : line.cp_white),
        sideMate: line.mate_white == null ? null : (turn === 'b' ? -line.mate_white : line.mate_white),
        pv, pvSan };
    });
    return { best: data.best_uci, lines, engineInfo: { name: data.engine || health.engine, build: 'Server', threads: health.threads,
      hashMb: health.hash_mb, depth: data.depth, nodes: data.nodes, time: data.time_ms, source: 'Server engine' } };
  } catch (error) {
    if (controller.signal.aborted && error.name !== 'AbortError') throw new DOMException('Server engine timed out.', 'TimeoutError');
    throw error;
  } finally { clearTimeout(timer); }
}

function sanToUciLine(fen, sanList) {
  const board = new Chess(fen);
  const moves = [];
  for (const san of sanList) {
    try { const move = board.move(san); moves.push(`${move.from}${move.to}${move.promotion || ''}`); }
    catch { break; }
  }
  return moves;
}
