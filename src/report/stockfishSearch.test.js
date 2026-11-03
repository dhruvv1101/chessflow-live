import { describe, expect, it } from 'vitest';
import { createStockfishSearch } from './stockfishSearch.js';

class FakeWorker {
  constructor() { this.commands = []; FakeWorker.instance = this; }
  postMessage(command) {
    this.commands.push(command);
    if (command === 'uci') queueMicrotask(() => { this.onmessage({ data: 'id name Stockfish 19' }); this.onmessage({ data: 'uciok' }); });
    if (command === 'isready') queueMicrotask(() => this.onmessage({ data: 'readyok' }));
    if (command === 'go depth 10') queueMicrotask(() => {
      this.onmessage({ data: 'info depth 10 score cp 80 nodes 420 pv e2e4 e7e5' });
      this.onmessage({ data: 'bestmove e2e4' });
    });
  }
  terminate() { this.terminated = true; }
}

describe('dedicated report Stockfish worker', () => {
  it('uses the Full single-thread build and searches the requested depth', async () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const engine = createStockfishSearch({ WorkerClass: FakeWorker, workerUrl: '/engine/stockfish-19-single.js' });
    const result = await engine(fen, { depth: 10 });

    expect(FakeWorker.instance.commands).toContain('setoption name Threads value 1');
    expect(FakeWorker.instance.commands).toContain('setoption name Hash value 16');
    expect(FakeWorker.instance.commands).toContain(`position fen ${fen}`);
    expect(FakeWorker.instance.commands).toContain('go depth 10');
    expect(result).toMatchObject({ engineName: 'Stockfish 19', score: { cp: 80, mate: null }, bestMoveUci: 'e2e4', pvUci: ['e2e4', 'e7e5'], depth: 10, nodes: 420 });
    engine.dispose();
  });
});
