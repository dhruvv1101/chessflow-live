import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Chess } from 'chess.js';
import { createGameAnalyzer } from './analysisJob.js';
import { setLiveGameActive } from './analysisCoordinator.js';

function sampleGame() {
  const chess = new Chess();
  const fenBefore = chess.fen();
  const played = chess.move('e4');
  return {
    url: 'https://chess.com/game/analysis-test', userColor: 'white',
    moves: [{ ply: 1, color: 'w', san: played.san, uci: 'e2e4', fenBefore, fenAfter: chess.fen(), clock: '0:04:00' }],
  };
}

function fakeCache() {
  const values = new Map();
  return {
    get: vi.fn(async (fen, depth) => values.get(`${fen}|${depth}`) || null),
    put: vi.fn(async (fen, depth, value) => values.set(`${fen}|${depth}`, value)),
  };
}

describe('resumable report game analysis', () => {
  let game;

  beforeEach(() => { game = sampleGame(); });
  afterEach(() => setLiveGameActive(false));

  it('compares before and after positions from the player perspective and tags context', async () => {
    const cache = fakeCache();
    const search = vi.fn(async (fen) => ({
      score: { cp: fen === game.moves[0].fenBefore ? 200 : -100, mate: null },
      bestMoveUci: fen === game.moves[0].fenBefore ? 'd2d4' : 'e7e5',
      pvUci: [fen === game.moves[0].fenBefore ? 'd2d4' : 'e7e5'], depth: 10, nodes: 1000,
    }));
    const analyzer = createGameAnalyzer({ search, cache, depth: 10, yieldMs: 0 });
    const result = await analyzer.analyzeGames([game]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ ply: 1, playedSan: 'e4', bestMoveUci: 'd2d4', classification: 'Inaccuracy', phase: 'opening', timeContext: 'had plenty of time', tactic: { confidence: 'likely' }, depth: 10 });
    expect(result[0].winProbabilityLoss).toBeGreaterThan(0.05);
    expect(result[0].evaluationBefore.userScore.cp).toBe(200);
    expect(result[0].evaluationAfter.userScore.cp).toBe(100);
    expect(cache.put).toHaveBeenCalledTimes(2);
    analyzer.dispose();
  });

  it('pauses an in-flight search for live play and resumes the same move', async () => {
    const cache = fakeCache();
    let call = 0;
    const search = vi.fn((fen, { signal }) => {
      call += 1;
      if (call === 1) return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('stopped', 'AbortError')), { once: true }));
      return Promise.resolve({ score: { cp: 0, mate: null }, bestMoveUci: 'e7e5', pvUci: ['e7e5'], depth: 10, nodes: 10 });
    });
    const analyzer = createGameAnalyzer({ search, cache, depth: 10, yieldMs: 0 });
    const resultPromise = analyzer.analyzeGames([game]);
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    analyzer.pause();
    await vi.waitFor(() => expect(search.mock.calls[0][1].signal.aborted).toBe(true));
    analyzer.resume();

    const result = await resultPromise;
    expect(result).toHaveLength(1);
    expect(search).toHaveBeenCalledTimes(3);
    analyzer.dispose();
  });

  it('cancels the analysis job without returning partial results as complete', async () => {
    const cache = fakeCache();
    const search = vi.fn((_fen, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true })));
    const analyzer = createGameAnalyzer({ search, cache, depth: 10, yieldMs: 0 });
    const resultPromise = analyzer.analyzeGames([game]);
    await vi.waitFor(() => expect(search).toHaveBeenCalled());
    analyzer.cancel();
    await expect(resultPromise).rejects.toMatchObject({ name: 'AbortError' });
    analyzer.dispose();
  });

  it('waits while the live ChessFlow game is active, then continues after it ends', async () => {
    setLiveGameActive(true);
    const search = vi.fn(async () => ({ score: { cp: 0, mate: null }, bestMoveUci: 'e7e5', pvUci: ['e7e5'], depth: 10, nodes: 10 }));
    const analyzer = createGameAnalyzer({ search, cache: fakeCache(), depth: 10, yieldMs: 0 });
    expect(analyzer.isPaused).toBe(true);
    const resultPromise = analyzer.analyzeGames([game]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(search).not.toHaveBeenCalled();

    setLiveGameActive(false);
    await expect(resultPromise).resolves.toHaveLength(1);
    expect(search).toHaveBeenCalledTimes(2);
    analyzer.dispose();
  });
});
