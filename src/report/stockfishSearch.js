import { FREE_LIMITS } from './config.js';

function abortError() {
  return new DOMException('Report analysis cancelled.', 'AbortError');
}

function parseInfo(message) {
  const depth = Number(message.match(/(?:^|\s)depth (\d+)/)?.[1] || 0);
  const cpValue = message.match(/\bscore cp (-?\d+)/)?.[1];
  const mateValue = message.match(/\bscore mate (-?\d+)/)?.[1];
  if (cpValue == null && mateValue == null) return null;
  return {
    depth,
    score: { cp: cpValue == null ? null : Number(cpValue), mate: mateValue == null ? null : Number(mateValue) },
    nodes: Number(message.match(/(?:^|\s)nodes (\d+)/)?.[1] || 0),
    pvUci: message.split(' pv ')[1]?.trim().split(/\s+/) || [],
  };
}

export function createStockfishSearch({
  WorkerClass = globalThis.Worker,
  workerUrl = '/engine/stockfish-19-single.js',
  startupTimeoutMs = 20_000,
  searchTimeoutMs = 45_000,
} = {}) {
  if (!WorkerClass) throw new Error('Web Workers are unavailable in this browser.');
  const worker = new WorkerClass(workerUrl);
  let engineName = 'Stockfish 19';
  let closed = false;
  let active = null;
  let rejectReady;
  let resolveReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  ready.catch(() => {});
  const startupTimer = setTimeout(() => fail(new Error('Stockfish report worker startup timed out.')), startupTimeoutMs);

  function finishSearch(search, error, result) {
    if (active !== search) return;
    clearTimeout(search.timer);
    search.signal?.removeEventListener('abort', search.abortHandler);
    active = null;
    if (search.aborted) search.reject(abortError());
    else if (error) search.reject(error);
    else search.resolve(result);
  }

  function fail(error) {
    if (closed) return;
    closed = true;
    clearTimeout(startupTimer);
    rejectReady(error);
    if (active) finishSearch(active, error);
    worker.terminate();
  }

  worker.onmessage = (event) => {
    const message = String(event.data);
    if (message.startsWith('id name ')) engineName = message.slice('id name '.length).split(/\s+by /)[0];
    if (message === 'uciok') {
      worker.postMessage('setoption name Hash value 16');
      worker.postMessage('setoption name Threads value 1');
      worker.postMessage('setoption name UCI_LimitStrength value false');
      worker.postMessage('isready');
      return;
    }
    if (message === 'readyok' && !active) {
      clearTimeout(startupTimer);
      resolveReady();
      return;
    }
    if (!active) return;
    if (message.startsWith('info ')) {
      const info = parseInfo(message);
      if (info && info.depth >= (active.info?.depth || 0)) active.info = info;
    }
    if (message.startsWith('bestmove')) {
      const bestMoveUci = message.split(/\s+/)[1];
      const info = active.info;
      if (!info && !active.aborted) { finishSearch(active, new Error('Stockfish returned no evaluation.')); return; }
      finishSearch(active, null, {
        engineName,
        score: info?.score || { cp: 0, mate: null },
        bestMoveUci: bestMoveUci === '(none)' ? null : bestMoveUci,
        pvUci: info?.pvUci || [],
        depth: info?.depth || 0,
        nodes: info?.nodes || 0,
      });
    }
  };
  worker.onerror = (event) => fail(new Error(event.message || 'Stockfish report worker failed.'));
  worker.onmessageerror = () => fail(new Error('Could not read a Stockfish report worker message.'));

  const search = async (fen, { depth = FREE_LIMITS.analysisDepth, signal } = {}) => {
    if (closed) throw new Error('Stockfish report worker has been closed.');
    if (signal?.aborted) throw abortError();
    await ready;
    if (signal?.aborted) throw abortError();
    if (active) throw new Error('Stockfish report worker already has an active search.');
    return new Promise((resolve, reject) => {
      const current = { resolve, reject, signal, info: null, aborted: false, abortHandler: null, timer: null };
      active = current;
      current.abortHandler = () => {
        if (active !== current || current.aborted) return;
        current.aborted = true;
        worker.postMessage('stop');
      };
      signal?.addEventListener('abort', current.abortHandler, { once: true });
      current.timer = setTimeout(() => fail(new Error('Stockfish report search timed out.')), searchTimeoutMs);
      worker.postMessage('ucinewgame');
      worker.postMessage(`position fen ${fen}`);
      worker.postMessage(`go depth ${depth}`);
    });
  };

  search.cancel = () => {
    if (!active || active.aborted) return Promise.resolve();
    active.aborted = true;
    worker.postMessage('stop');
    return new Promise((resolve) => {
      const current = active;
      const reject = current.reject;
      current.reject = (error) => { reject(error); resolve(); };
    });
  };
  search.dispose = () => {
    if (closed) return;
    closed = true;
    clearTimeout(startupTimer);
    if (active) {
      clearTimeout(active.timer);
      active.signal?.removeEventListener('abort', active.abortHandler);
      active.reject(abortError());
      active = null;
    }
    rejectReady(new Error('Stockfish report worker has been closed.'));
    worker.terminate();
  };

  worker.postMessage('uci');
  return search;
}
