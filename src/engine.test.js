import { afterEach, describe, expect, it, vi } from 'vitest';
import { Engine } from './engine.js';

class MockWorker {
  static latest;
  constructor() { this.sent = []; MockWorker.latest = this; }
  postMessage(message) {
    this.sent.push(message);
    if (message === 'uci') queueMicrotask(() => this.onmessage?.({ data: 'uciok' }));
    if (message === 'isready') queueMicrotask(() => this.onmessage?.({ data: 'readyok' }));
    if (message.startsWith('go ')) {
      queueMicrotask(() => {
        this.onmessage?.({ data: 'info depth 12 multipv 1 score cp 35 pv e2e4 e7e5 g1f3 b8c6' });
        this.onmessage?.({ data: 'bestmove e2e4' });
      });
    }
  }
  terminate() { this.terminated = true; }
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('Engine worker wrapper', () => {
  it('configures hash and skill, then returns multipv and a 10-ply PV', async () => {
    vi.stubGlobal('Worker', MockWorker);
    const engine = new Engine('/engine/stockfish.js', { timeoutMs: 100 });
    const result = await engine.analyze('startpos', { movetime: 400, multipv: 3, skill: 8 });
    expect(MockWorker.latest.sent).toContain('setoption name Hash value 32');
    expect(MockWorker.latest.sent).toContain('setoption name Threads value 1');
    expect(MockWorker.latest.sent).toContain('setoption name UCI_LimitStrength value false');
    expect(MockWorker.latest.sent).toContain('setoption name Skill Level value 8');
    expect(result.best).toBe('e2e4');
    expect(result.engineInfo).toMatchObject({ build: 'Lite single-thread', threads: 1, hashMb: 32, depth: 12 });
    expect(result.lines[0].pv).toEqual(['e2e4', 'e7e5', 'g1f3', 'b8c6']);
    engine.dispose();
  });

  it('uses the final rank-one PV head when Skill Level bestmove disagrees', async () => {
    class MismatchedWorker extends MockWorker {
      postMessage(message) {
        this.sent.push(message);
        if (message === 'uci') queueMicrotask(() => this.onmessage?.({ data: 'uciok' }));
        if (message === 'isready') queueMicrotask(() => this.onmessage?.({ data: 'readyok' }));
        if (message.startsWith('go ')) queueMicrotask(() => {
          this.onmessage?.({ data: 'info depth 24 multipv 1 score mate 2 pv d3d7 h8g8 d7g7' });
          this.onmessage?.({ data: 'bestmove f6g6' });
        });
      }
    }
    vi.stubGlobal('Worker', MismatchedWorker);
    const engine = new Engine('/engine/stockfish-19-single.js');
    const result = await engine.analyze('7k/8/5K2/8/8/3Q4/8/8 w - - 0 1', { skill: 20, movetime: 4000, multipv: 3 });
    expect(result.best).toBe('d3d7');
    expect(result.engineBest).toBe('f6g6');
    engine.dispose();
  });

  it('rejects with a timeout and terminates a failed worker', async () => {
    vi.stubGlobal('Worker', class extends MockWorker {
      postMessage(message) { this.sent.push(message); }
    });
    const engine = new Engine('/engine/bad.js', { timeoutMs: 10 });
    await expect(engine.analyze('startpos')).rejects.toThrow(/timed out/i);
    expect(MockWorker.latest.terminated).toBe(true);
  });

  it('stops and rejects an in-flight search when cancelled', async () => {
    class SearchWorker extends MockWorker {
      postMessage(message) {
        this.sent.push(message);
        if (message === 'uci') queueMicrotask(() => this.onmessage?.({ data: 'uciok' }));
        if (message === 'isready') queueMicrotask(() => this.onmessage?.({ data: 'readyok' }));
      }
    }
    vi.stubGlobal('Worker', SearchWorker);
    const engine = new Engine('/engine/stockfish.js', { timeoutMs: 100 });
    await engine.ready;
    const pending = engine.analyze('8/8/8/8/8/8/4K3/7k w - - 0 1');
    await Promise.resolve();
    engine.cancel();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(SearchWorker.latest.sent).toContain('stop');
    engine.dispose();
  });
});
