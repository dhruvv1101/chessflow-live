import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { buildRadialLayout } from './radialLayout.js';
import openings from '../../public/data/openings.json';
import { attachOpeningContexts, buildOpeningTree, buildOpeningSummary } from './tree.js';

function makeGame(url, sans, result) {
  const chess = new Chess();
  const moves = sans.map((san, index) => {
    const fenBefore = chess.fen();
    const move = chess.move(san);
    return { ply: index + 1, color: move.color, san: move.san, fenBefore, fenAfter: move.after, timeSpentSeconds: 8 + index };
  });
  return { url, headers: { White: 'Player', Black: 'Opponent' }, userColor: 'white', result, moves };
}

describe('report opening position tree', () => {
  it('counts games on a shared move edge for line-width scaling', () => {
    const games = [makeGame('edge-a', ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'd3'], '1-0'), makeGame('edge-b', ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'd3'], '0-1')];
    const rows = games.flatMap((game) => [1, 3, 5].map((ply) => ({
      gameKey: game.url, ply, fenBefore: game.moves[ply - 1].fenBefore, isUserMove: true,
      playedSan: game.moves[ply - 1].san, opponentResponseSan: game.moves[ply].san,
    })));
    const tree = buildOpeningTree(games, rows);
    expect(tree.links).toHaveLength(2);
    expect(tree.links[0]).toMatchObject({ move: 'e4', opponentReply: 'e5', games: 2, gameIds: ['edge-a', 'edge-b'] });
  });

  it('merges transpositions into one FEN-keyed node and aggregates user outcomes', () => {
    const games = [
      makeGame('game-a', ['Nf3', 'd5', 'g3', 'Nf6', 'Bg2'], '1-0'),
      makeGame('game-b', ['g3', 'd5', 'Nf3', 'Nf6', 'Bg2'], '1/2-1/2'),
    ];
    const transposedFen = games[0].moves[4].fenBefore;
    expect(games[1].moves[4].fenBefore.split(' ').slice(0, 4)).toEqual(transposedFen.split(' ').slice(0, 4));
    const rows = games.map((game) => ({ gameKey: game.url, ply: 5, fenBefore: game.moves[4].fenBefore, isUserMove: true, playedSan: 'Bg2', classification: 'Good', winProbabilityLoss: 0.02, evaluationBefore: { winProbability: 0.6 }, evaluationAfter: { winProbability: 0.58 }, timeSpentSeconds: 12 }));
    const key = transposedFen.split(' ').slice(0, 4).join(' ');
    const tree = buildOpeningTree(games, rows, { database: { [key]: { eco: 'A07', name: 'Reti Opening', plyCount: 4 } } });
    const nodes = tree.nodes.filter((node) => node.positionKey === key);

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ games: 2, wins: 1, draws: 1, losses: 0, eco: 'A07', openingName: 'Reti Opening', lowConfidence: true });
    expect(nodes[0].exampleGameIds).toEqual(['game-a', 'game-b']);
    expect(nodes[0]).toMatchObject({ depthPly: 4, move: 'Bg2' });
    expect(tree.children.flatMap((color) => color.children).find((node) => node.positionKey === key)).toEqual(nodes[0]);
  });

  it('uses the most common legal played path and the actual move ply for a transposed node', () => {
    const games = [
      makeGame('path-a', ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Bd2'], '1-0'),
      makeGame('path-b', ['e4', 'c5', 'Nc3', 'd6', 'Nf3', 'Nf6', 'd4', 'cxd4', 'Nxd4', 'a6', 'Bd2'], '1/2-1/2'),
      makeGame('path-c', ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Bd2'], '0-1'),
    ];
    const rows = games.map((game) => ({ gameKey: game.url, ply: 11, fenBefore: game.moves[10].fenBefore, isUserMove: true, playedSan: 'Bd2', notation: '6. Bd2' }));
    const result = buildOpeningTree(games, rows);
    const selected = result.nodes.find((entry) => entry.positionKey === games[0].moves[10].fenBefore.split(' ').slice(0, 4).join(' '));
    expect(selected.movePly).toBe(11);
    expect(selected.pathTransposed).toBe(true);
    expect(selected.pathGameCount).toBe(2);
    const replay = new Chess(selected.commonPathStartFen);
    for (const san of selected.commonPathSans) replay.move(san);
    expect(replay.fen().split(' ').slice(0, 4)).toEqual(selected.positionKey.split(' '));
    expect(selected.commonPathDisplay).toBe('1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6');
    for (const node of result.nodes) {
      const replayed = new Chess(node.commonPathStartFen);
      for (const san of node.commonPathSans) replayed.move(san);
      expect(replayed.fen().split(' ').slice(0, 4), node.commonPathDisplay).toEqual(node.positionKey.split(' '));
      expect(node.commonPathSans.length + 1).toBe(node.movePly);
    }
    const displayed = buildRadialLayout(result, { showLowConfidence: true, maxDepth: 12 }).nodes.find((entry) => entry.positionKey === selected.positionKey);
    expect(displayed.movePly).toBe(11);
    expect(displayed.lineBefore.join(' ')).toBe(selected.commonPathDisplay);
  });

  it('applies minimum sample and low-confidence thresholds and summarizes named openings', () => {
    const games = [makeGame('one', ['e4', 'e5', 'Ke2', 'Nc6', 'Nf3', 'Nf6'], '1-0'), makeGame('two', ['e4', 'e5', 'Ke2', 'Nc6', 'Nf3', 'Nf6'], '0-1'), makeGame('three', ['e4', 'e5', 'Ke2', 'Nc6', 'Nf3', 'Nf6'], '1/2-1/2')];
    games.forEach((game) => { game.eco = 'C20'; });
    const rows = games.map((game) => ({ gameKey: game.url, ply: 3, fenBefore: game.moves[2].fenBefore, fenAfter: game.moves[2].fenAfter, isUserMove: true, playedSan: 'Ke2', classification: 'Good', evaluationBefore: { winProbability: 0.5 }, evaluationAfter: { winProbability: 0.55 }, timeSpentSeconds: 3 }));
    const tree = buildOpeningTree(games, attachOpeningContexts(games, rows, openings), { database: openings });
    const node = tree.nodes.find((entry) => entry.positionKey === games[0].moves[2].fenBefore.split(' ').slice(0, 4).join(' '));
    expect(node).toMatchObject({ games: 3, lowConfidence: false, eco: 'C20', openingName: 'Bongcloud Attack' });
    expect(node.averageWinProbabilityChange).toBeCloseTo(0.05);
    expect(buildOpeningSummary(tree)).toEqual(expect.arrayContaining([expect.objectContaining({ color: 'white', eco: 'C20', name: 'Bongcloud Attack', games: 3 })]));
  });

  it('uses the deepest opening on each game path and never attributes a colliding ECO name to another line', () => {
    const bongclouds = [makeGame('b1', ['e4', 'e5', 'Ke2', 'Nc6', 'Nf3', 'Nf6'], '1-0'), makeGame('b2', ['e4', 'e5', 'Ke2', 'Nc6', 'Nf3', 'Nf6'], '0-1')];
    bongclouds.forEach((game) => { game.eco = 'C20'; });
    const tennison = makeGame('t1', ['e4', 'd5', 'Nf3', 'Nf6', 'd4', 'c6'], '1-0');
    tennison.eco = 'A06';
    const games = [...bongclouds, tennison];
    const rows = games.map((game) => ({
      gameKey: game.url, ply: 3, fenBefore: game.moves[2].fenBefore,
      fenAfter: game.moves[2].fenAfter, isUserMove: true, playedSan: game.moves[2].san,
      classification: 'Good', evaluationBefore: { winProbability: 0.5 }, evaluationAfter: { winProbability: 0.5 },
    }));
    const contextual = attachOpeningContexts(games, rows, openings);
    const tree = buildOpeningTree(games, contextual, { database: openings });
    const summary = buildOpeningSummary(tree);
    expect(contextual.find((row) => row.gameKey === 'b1').openingContext).toMatchObject({ eco: 'C20', name: 'Bongcloud Attack' });
    expect(contextual.find((row) => row.gameKey === 't1').openingContext).toMatchObject({ eco: 'A06', name: expect.stringContaining('Tennison Gambit') });
    expect(summary.find((entry) => entry.name === 'Bongcloud Attack').games).toBe(2);
    expect(summary.some((entry) => entry.name.includes('Tennison Gambit'))).toBe(false);
  });

  it('removes the hung-piece tag on a named gambit line and records the gambit on its node', () => {
    const game = makeGame('englund', ['d4', 'e5', 'f4', 'exf4', 'Nf3'], '0-1');
    game.eco = 'A40';
    const row = { gameKey: game.url, ply: 3, fenBefore: game.moves[2].fenBefore, fenAfter: game.moves[2].fenAfter,
      isUserMove: true, playedSan: 'f4', notation: '2. f4', tacticTags: [{ kind: 'allowed-capture-hung-piece' }], classification: 'Mistake' };
    const contextual = attachOpeningContexts([game], [row], openings);
    expect(contextual[0].tacticTags).toEqual([]);
    expect(contextual[0].isNamedOpeningMove).toBe(true);
    const tree = buildOpeningTree([game], contextual, { database: openings });
    expect(tree.nodes[0].openingGambits).toEqual([expect.objectContaining({ move: '2. f4', name: expect.stringContaining('Gambit') })]);
  });

  it('excludes short games from the tree sample', () => {
    const short = makeGame('short', ['e4', 'e5'], '0-1');
    const row = { gameKey: 'short', ply: 1, fenBefore: short.moves[0].fenBefore, isUserMove: true };
    expect(buildOpeningTree([short], [row]).nodes).toEqual([]);
  });
});
