import { ENGINE } from './config.js';
import { toWhiteScore } from './game.js';

export class Engine {
  constructor(workerUrl = '/engine/stockfish-19-lite-single.js', {
    timeoutMs = ENGINE.timeoutMs, WorkerClass = globalThis.Worker,
    build = 'Lite single-thread', threads = 1, hashMb = ENGINE.hashMb,
  } = {}) {
    this.timeoutMs = timeoutMs;
    this.workerUrl = workerUrl;
    this.build = build;
    this.threads = threads;
    this.hashMb = hashMb;
    this.worker = null;
    this.active = null;
    this.closed = false;
    this.engineName = 'Stockfish 19';
    this.ready = new Promise((resolve, reject) => {
      if (!WorkerClass) { reject(new Error('Web Workers are unavailable in this browser.')); return; }
      try { this.worker = new WorkerClass(workerUrl); }
      catch (error) { reject(new Error(`Could not start Stockfish worker: ${error.message}`)); return; }
      const timer = setTimeout(() => this.fail(new Error('Stockfish startup timed out.')), timeoutMs);
      this.handshake = { resolve: () => { clearTimeout(timer); resolve(); }, reject: (error) => { clearTimeout(timer); reject(error); } };
      this.worker.onmessage = (event) => this.onMessage(String(event.data));
      this.worker.onerror = (event) => this.fail(new Error(event.message || 'Stockfish worker failed to load.'));
      this.worker.onmessageerror = () => this.fail(new Error('Could not read a message from Stockfish.'));
      this.worker.postMessage('uci');
    });
    this.ready.catch(() => {});
  }

  onMessage(message) {
    if (message === 'uciok' && !this.readyDone) {
      this.readyDone = true;
      this.worker.postMessage(`setoption name Hash value ${this.hashMb}`);
      this.worker.postMessage(`setoption name Threads value ${this.threads}`);
      this.worker.postMessage('setoption name UCI_LimitStrength value false');
      this.worker.postMessage('isready');
      return;
    }
    if (message.startsWith('id name ')) this.engineName = message.slice('id name '.length);
    if (message === 'readyok' && !this.isReady) {
      this.isReady = true;
      this.handshake?.resolve();
      return;
    }
    if (this.active) this.consumeAnalysis(message);
  }

  async analyze(fen, { movetime = 800, multipv = ENGINE.multiPv, skill = 20, color = fen.split(' ')[1] || 'w', signal } = {}) {
    if (this.closed) throw new Error('Stockfish worker has been closed.');
    await this.ready;
    if (this.active) await this.cancel();
    if (signal?.aborted) throw new DOMException('Analysis cancelled.', 'AbortError');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error('Stockfish analysis timed out.')), Math.max(this.timeoutMs, movetime + 8000));
      const active = { resolve, reject, timer, lines: new Map(), color, startedAt: performance.now(), aborted: false, abortHandler: null, signal };
      this.active = active;
      if (signal) {
        active.abortHandler = () => this.cancel();
        signal.addEventListener('abort', active.abortHandler, { once: true });
      }
      // Always clear opponent strength limits; difficulty must not leak into a hint or review.
      this.worker.postMessage(`setoption name Skill Level value ${skill}`);
      this.worker.postMessage('setoption name UCI_LimitStrength value false');
      this.worker.postMessage(`setoption name MultiPV value ${multipv}`);
      this.worker.postMessage('ucinewgame');
      this.worker.postMessage('isready');
      active.awaitingReady = true;
      active.startSearch = () => {
        this.worker.postMessage(`position fen ${fen}`);
        this.worker.postMessage(`go movetime ${movetime}`);
      };
    });
  }

  consumeAnalysis(message) {
    const active = this.active;
    if (message === 'readyok' && active?.awaitingReady) {
      active.awaitingReady = false;
      if (active.aborted) {
        this.finish(active, null, { best: null, lines: [] });
        return;
      }
      active.startSearch();
      return;
    }
    if (message.startsWith('info ') && message.includes(' pv ')) {
      const rank = Number(message.match(/(?:^|\s)multipv (\d+)/)?.[1] ?? 1);
      const cp = message.match(/\bscore cp (-?\d+)/)?.[1];
      const mate = message.match(/\bscore mate (-?\d+)/)?.[1];
      const pv = message.split(' pv ')[1].trim().split(/\s+/).slice(0, ENGINE.pvPlies);
      const score = toWhiteScore({ cp: cp == null ? null : Number(cp), mate: mate == null ? null : Number(mate) }, active.color);
      active.lines.set(rank, {
        rank, move: pv[0], cp: score.cp, mate: score.mate,
        sideCp: cp == null ? null : Number(cp), sideMate: mate == null ? null : Number(mate), pv,
        depth: Number(message.match(/(?:^|\s)depth (\d+)/)?.[1] || 0),
        nodes: Number(message.match(/(?:^|\s)nodes (\d+)/)?.[1] || 0),
        time: Number(message.match(/(?:^|\s)time (\d+)/)?.[1] || 0),
      });
    }
    if (message.startsWith('bestmove')) {
      const engineBest = message.split(/\s+/)[1];
      const lines = [...active.lines.values()].sort((a, b) => a.rank - b.rank);
      // Skill settings can pick a separate move even at Skill 20. Prefer the
      // final rank-one PV head for the displayed best line after bestmove arrives.
      this.finish(active, null, { best: lines[0]?.move || engineBest, engineBest, lines });
    }
  }

  finish(active, error, result) {
    if (this.active !== active) return;
    clearTimeout(active.timer);
    active.signal?.removeEventListener?.('abort', active.abortHandler);
    this.active = null;
    if (active.aborted) active.reject(new DOMException('Analysis cancelled.', 'AbortError'));
    else if (error) active.reject(error);
    else active.resolve({ ...result, engineInfo: {
      name: this.engineName, build: this.build, threads: this.threads, hashMb: this.hashMb,
      depth: Math.max(0, ...result.lines.map((line) => line.depth)),
      nodes: Math.max(0, ...result.lines.map((line) => line.nodes)),
      time: Math.max(0, ...result.lines.map((line) => line.time), Math.round(performance.now() - active.startedAt)),
    } });
    active.cancelResolve?.();
  }

  cancel() {
    const active = this.active;
    if (!active) return Promise.resolve();
    if (!active.aborted) {
      active.aborted = true;
      this.worker.postMessage('stop');
    }
    // Keep the worker occupied until its final bestmove arrives; no overlapping `go` commands.
    return new Promise((resolve) => {
      const previousResolve = active.reject;
      active.reject = (error) => { previousResolve(error); resolve(); };
      active.cancelResolve = resolve;
    });
  }

  fail(error) {
    this.handshake?.reject(error);
    if (this.active) this.finish(this.active, error);
    this.closed = true;
    this.worker?.terminate();
  }

  dispose() {
    if (this.closed) return;
    void this.cancel();
    this.closed = true;
    this.worker?.terminate();
  }
}
