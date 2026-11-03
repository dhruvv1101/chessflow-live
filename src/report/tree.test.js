import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { buildOpeningTree, buildOpeningSummary } from './tree.js';

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
    expect(tree.children.flatMap((color) => color.children).find((node) => node.positionKey === key)).toEqual(nodes[0]);
  });

  it('applies minimum sample and low-confidence thresholds and summarizes named openings', () => {
    const games = [makeGame('one', ['e4'], '1-0'), makeGame('two', ['e4'], '0-1'), makeGame('three', ['e4'], '1/2-1/2')];
    const rows = games.map((game) => ({ gameKey: game.url, ply: 1, fenBefore: game.moves[0].fenBefore, isUserMove: true, playedSan: 'e4', classification: 'Good', evaluationBefore: { winProbability: 0.5 }, evaluationAfter: { winProbability: 0.55 }, timeSpentSeconds: 3 }));
    const key = games[0].moves[0].fenBefore.split(' ').slice(0, 4).join(' ');
    const tree = buildOpeningTree(games, rows, { database: { [key]: { eco: 'B00', name: 'King\'s Pawn Opening' } } });
    expect(tree.children[0].children[0]).toMatchObject({ games: 3, lowConfidence: false });
    expect(tree.children[0].children[0].averageWinProbabilityChange).toBeCloseTo(0.05);
    expect(buildOpeningSummary(tree)).toEqual(expect.arrayContaining([expect.objectContaining({ eco: 'B00', name: 'King\'s Pawn Opening', games: 3 })]));
  });
});
