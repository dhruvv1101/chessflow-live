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
    moves: [{ ply: 1, color: 'w', san: played.san, uci: 'e2e4', fenBefore, fenAfter: chess.fen(), clock: '0:04:00', timeSpentSeconds: 45, clockRemainingSeconds: 240 }],
  };
}

function fakeCache() {
  const values = new Map();
  const gameValues = new Map();
  return {
    get: vi.fn(async (fen, depth) => values.get(`${fen}|${depth}`) || null),
    put: vi.fn(async (fen, depth, value) => values.set(`${fen}|${depth}`, value)),
    putGame: vi.fn(async (gameKey, depth, rows) => gameValues.set(`${gameKey}|${depth}`, rows)),
    getGame: vi.fn(async (gameKey, depth) => gameValues.get(`${gameKey}|${depth}`) || null),
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
    expect(result[0]).toMatchObject({ ply: 1, notation: '1. e4', playedSan: 'e4', bestMoveUci: 'd2d4', classification: 'Inaccuracy', phase: 'opening', timeContext: 'long think', timeContextConfidence: 'likely', timeSpentSeconds: 45, clockRemainingSeconds: 240, tactic: { confidence: 'likely' }, depth: 10 });
    expect(result[0].winProbabilityLoss).toBeGreaterThan(0.05);
    expect(result[0].evaluationBefore.userScore.cp).toBe(200);
    expect(result[0].evaluationAfter.userScore.cp).toBe(100);
    expect(cache.put).toHaveBeenCalledTimes(2);
    analyzer.dispose();
  });

  it('never flags an exact engine-best move even when separate searches disagree', async () => {
    const search = vi.fn(async (fen) => ({
      score: { cp: fen === game.moves[0].fenBefore ? 400 : -500, mate: null },
      bestMoveUci: fen === game.moves[0].fenBefore ? 'e2e4' : 'e7e5',
      pvUci: [], depth: 10, nodes: 20,
    }));
    const analyzer = createGameAnalyzer({ search, cache: fakeCache(), depth: 10, yieldMs: 0 });
    const [row] = await analyzer.analyzeGames([game]);

    expect(row).toMatchObject({ playedUci: 'e2e4', bestMoveUci: 'e2e4', classification: 'Good', evaluationLossCp: 0, winProbabilityLoss: 0, lostAdvantage: false });
    analyzer.dispose();
  });

  it('analyzes every ply without a cap and records move-number notation and best SAN', async () => {
    const chess = new Chess();
    const moves = [];
    const sanMoves = ['Nf3', 'Nf6', 'Ng1', 'Ng8'];
    for (const san of Array.from({ length: 20 }, () => sanMoves).flat()) {
      const fenBefore = chess.fen();
      const move = chess.move(san);
      moves.push({ ply: moves.length + 1, color: move.color, san: move.san, uci: `${move.from}${move.to}`, fenBefore, fenAfter: move.after, clock: '0:04:00', timeSpentSeconds: 10, clockRemainingSeconds: 240 });
    }
    const fullGame = { ...game, moves };
    const search = vi.fn(async (fen) => ({
      score: { cp: fen === moves[0].fenBefore ? 300 : 0, mate: null },
      bestMoveUci: `${new Chess(fen).moves({ verbose: true })[0].from}${new Chess(fen).moves({ verbose: true })[0].to}`,
      pvUci: [`${new Chess(fen).moves({ verbose: true })[0].from}${new Chess(fen).moves({ verbose: true })[0].to}`], depth: 10, nodes: 20,
    }));
    const cache = fakeCache();
    const analyzer = createGameAnalyzer({ search, cache, depth: 10, yieldMs: 0 });
    const rows = await analyzer.analyzeGames([fullGame]);

    expect(rows).toHaveLength(80);
    expect(rows.slice(0, 4).map((row) => row.notation)).toEqual(['1. Nf3', '1... Nf6', '2. Ng1', '2... Ng8']);
    expect(rows.every((row) => row.bestMoveSan)).toBe(true);
    expect(rows.slice(0, 4).map((row) => row.moverColor)).toEqual(['white', 'black', 'white', 'black']);
    expect(rows.every((row) => row.userColor === 'white')).toBe(true);
    expect(cache.putGame).toHaveBeenCalledWith(fullGame.url, 10, rows);
    analyzer.dispose();
  });

  it('persists all move rows, including good moves excluded from the summary', async () => {
    const cache = fakeCache();
    const search = vi.fn(async (fen) => ({
      score: { cp: 0, mate: null }, bestMoveUci: `${new Chess(fen).moves({ verbose: true })[0].from}${new Chess(fen).moves({ verbose: true })[0].to}`,
      pvUci: [], depth: 10, nodes: 1,
    }));
    const analyzer = createGameAnalyzer({ search, cache, depth: 10, yieldMs: 0 });
    const rows = await analyzer.analyzeGames([game]);
    expect(rows[0].classification).toBe('Good');
    expect(await cache.getGame(game.url, 10)).toEqual(rows);
    analyzer.dispose();
  });

  it('marks a missed chance when the opponent blunders and the user misses the best reply', async () => {
    const chess = new Chess();
    const moves = [];
    for (const san of ['e4', 'e5', 'Nf3']) {
      const fenBefore = chess.fen();
      const move = chess.move(san);
      moves.push({ ply: moves.length + 1, color: move.color, san: move.san, uci: `${move.from}${move.to}`, fenBefore, fenAfter: move.after });
    }
    const gameWithMissedChance = { ...game, moves };
    const whiteScores = new Map([
      [moves[0].fenBefore, 0],
      [moves[0].fenAfter, 0],
      [moves[1].fenAfter, 250],
      [moves[2].fenAfter, 100],
    ]);
    const bestMoves = new Map([
      [moves[0].fenBefore, 'e2e4'],
      [moves[0].fenAfter, 'd7d5'],
      [moves[1].fenAfter, 'd2d4'],
      [moves[2].fenAfter, 'b8c6'],
    ]);
    const search = vi.fn(async (fen) => ({
      score: { cp: (fen.split(/\s+/)[1] === 'b' ? -1 : 1) * whiteScores.get(fen), mate: null },
      bestMoveUci: bestMoves.get(fen), pvUci: [], depth: 10, nodes: 10,
    }));
    const analyzer = createGameAnalyzer({ search, cache: fakeCache(), depth: 10, yieldMs: 0 });

    const rows = await analyzer.analyzeGames([gameWithMissedChance]);

    expect(rows[1]).toMatchObject({ isUserMove: false, classification: 'Blunder' });
    expect(rows[2]).toMatchObject({ isUserMove: true, playedSan: 'Nf3', bestMoveSan: 'd4', missedChance: { confidence: 'likely', opponentMoveNotation: '1... e5', opponentMoveClassification: 'Blunder' } });
    expect(rows[2].evaluationBefore.userScore.cp).toBe(250);
    analyzer.dispose();
  });

  it('does not attach a missed-chance tag to a Good reply', async () => {
    const chess = new Chess();
    const moves = [];
    for (const san of ['e4', 'e5', 'Nf3']) {
      const fenBefore = chess.fen();
      const move = chess.move(san);
      moves.push({ ply: moves.length + 1, color: move.color, san: move.san, uci: `${move.from}${move.to}`, fenBefore, fenAfter: move.after });
    }
    const scores = new Map([[moves[0].fenBefore, 0], [moves[0].fenAfter, 0], [moves[1].fenAfter, 250], [moves[2].fenAfter, 240]]);
    const bestMoves = new Map([[moves[0].fenBefore, 'e2e4'], [moves[0].fenAfter, 'd7d5'], [moves[1].fenAfter, 'd2d4'], [moves[2].fenAfter, 'b8c6']]);
    const search = vi.fn(async (fen) => ({
      score: { cp: (fen.split(/\s+/)[1] === 'b' ? -1 : 1) * scores.get(fen), mate: null },
      bestMoveUci: bestMoves.get(fen), pvUci: [], depth: 10, nodes: 10,
    }));
    const analyzer = createGameAnalyzer({ search, cache: fakeCache(), depth: 10, yieldMs: 0 });
    const rows = await analyzer.analyzeGames([{ ...game, moves }]);

    expect(rows[1].classification).toBe('Blunder');
    expect(rows[2].classification).toBe('Good');
    expect(rows[2]).not.toHaveProperty('missedChance');
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
