import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const stockfish = require('stockfish');

const positions = [
  { name: 'back-rank mate', fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', expected: 'a1a8' },
  { name: "Fool's mate pattern", fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', expected: 'h5f7' },
  { name: 'mate in two', fen: '7k/8/5K2/8/8/3Q4/8/8 w - - 0 1', expected: ['d3d7', 'f6g6'] },
  { name: 'hanging queen', fen: '4k3/8/8/8/8/5q2/8/4KQ2 w - - 0 1', expected: 'f1f3' },
  { name: 'knight fork on king and queen', fen: '4k3/8/4q3/1N6/8/8/8/K7 w - - 0 1', expected: 'b5c7' },
];

describe('hint strength tactical positions (real Stockfish WASM)', () => {
  it('runs the five verified tactics with Full Stockfish 19 at full strength', async () => {
    const commands = [];
    const outputs = [];
    let current = null;
    const engine = stockfish('single', (message) => {
      const line = String(message).trim();
      if (!line) return;
      outputs.push(line);
      if (current) current(line);
    });
    engine.listener = (message) => {
      const line = String(message).trim();
      if (!line) return;
      outputs.push(line);
      if (current) current(line);
    };
    const send = (command) => { commands.push(command); engine.processCommand(command); };
    const waitFor = (predicate, timeoutMs = 30_000) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => { current = null; reject(new Error(`Timed out waiting for UCI output. Last lines: ${outputs.slice(-8).join(' | ')}`)); }, timeoutMs);
      current = (line) => { if (predicate(line)) { clearTimeout(timer); current = null; resolve(line); } };
    });
    const initialize = async () => {
      const ready = waitFor((line) => line === 'uciok'); send('uci'); await ready;
      send('setoption name Hash value 32');
      send('setoption name Threads value 1');
      send('setoption name UCI_LimitStrength value false');
      const readyToSearch = waitFor((line) => line === 'readyok'); send('isready'); await readyToSearch;
    };
    try {
      await initialize();
      const results = [];
      for (const position of positions) {
        send('stop');
        send('setoption name Skill Level value 20');
        send('setoption name UCI_LimitStrength value false');
        send('setoption name MultiPV value 3');
        send('ucinewgame');
        const ready = waitFor((line) => line === 'readyok'); send('isready'); await ready;
        send(`position fen ${position.fen}`);
        const resultStart = outputs.length;
        const resultPromise = waitFor((line) => line.startsWith('bestmove'));
        send('go movetime 4000');
        const bestLine = await resultPromise;
        const infos = outputs.slice(resultStart).filter((line) => line.startsWith('info ') && line.includes(' pv '));
        const latest = new Map();
        for (const line of infos) {
          const rank = Number(line.match(/\bmultipv (\d+)/)?.[1] || 1);
          latest.set(rank, line);
        }
        const engineBest = bestLine.split(/\s+/)[1];
        const rankOne = [...latest].find(([rank]) => rank === 1)?.[1];
        const depth = rankOne?.match(/(?:^|\s)depth (\d+)/)?.[1] || 'unknown';
        const score = rankOne?.match(/\bscore (cp|mate) (-?\d+)/)?.slice(1) || [];
        const pv = rankOne?.split(' pv ')[1]?.split(/\s+/).slice(0, 10) || [];
        const best = pv[0] || engineBest;
        const result = { name: position.name, expected: position.expected, best, engineBest, depth: Number(depth), score, pv };
        results.push(result);
        outputs.push(`BASELINE_RESULT ${JSON.stringify(result)}`);
      }
      console.log('AFTER_HINT_RESULTS', JSON.stringify(results));
      console.log('AFTER_EXACT_UCI_COMMANDS', JSON.stringify(commands));
      for (let index = 0; index < positions.length; index += 1) {
        const acceptable = Array.isArray(positions[index].expected) ? positions[index].expected : [positions[index].expected];
        expect(acceptable, positions[index].name).toContain(results[index].best);
        if (positions[index].name === 'mate in two') expect(results[index].score).toEqual(['mate', '2']);
      }
      engine.terminate();
    } finally { try { engine.terminate(); } catch { /* already stopped */ } }
  }, 90_000);
});

