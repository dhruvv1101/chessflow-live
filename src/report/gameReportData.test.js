import { describe, expect, it } from 'vitest';
import { buildEvalGraphData, filterGamesByIds, resultFromUserSide } from './gameReportData.js';

describe('report game graph data', () => {
  it('maps win, draw, loss and unfinished outcomes from the imported player side', () => {
    expect(resultFromUserSide({ result: '1-0', userColor: 'white' })).toBe('Win');
    expect(resultFromUserSide({ result: '1-0', userColor: 'black' })).toBe('Loss');
    expect(resultFromUserSide({ result: '1/2-1/2', userColor: 'black' })).toBe('Draw');
    expect(resultFromUserSide({ result: '*', userColor: 'white' })).toBe('In progress');
  });

  it('creates a bounded win-probability graph with an even line and only my flagged moves', () => {
    const game = { url: 'game-a', moves: Array.from({ length: 3 }, () => ({})) };
    const graph = buildEvalGraphData(game, [
      { gameKey: 'game-a', ply: 1, isUserMove: false, classification: 'Blunder', evaluationAfter: { winProbability: 0.2 } },
      { gameKey: 'game-a', ply: 2, isUserMove: true, classification: 'Mistake', notation: '1... e5', evaluationAfter: { winProbability: 1.2 } },
      { gameKey: 'game-a', ply: 3, isUserMove: true, classification: 'Good', evaluationAfter: { winProbability: 0.4 } },
    ]);
    expect(graph.points[0]).toMatchObject({ ply: 0, winProbability: 0.5 });
    expect(graph.points.at(-1).winProbability).toBe(0.4);
    expect(graph.evenY).toBe(125);
    expect(graph.flagged).toHaveLength(1);
    expect(graph.flagged[0]).toMatchObject({ ply: 2, classification: 'Mistake', notation: '1... e5' });
    expect(graph.points.every((point) => point.x >= 20 && point.x <= 740 && point.y >= 20 && point.y <= 230)).toBe(true);
  });

  it('filters the game list by selected node or leak examples', () => {
    const games = [{ url: 'a' }, { url: 'b' }, { url: 'c' }];
    expect(filterGamesByIds(games, ['c', 'a']).map((game) => game.url)).toEqual(['a', 'c']);
    expect(filterGamesByIds(games, null)).toEqual(games);
  });
});
