import { describe, expect, it } from 'vitest';
import { buildEvalGraphData, EVAL_MARKER_SHAPE, filterGamesByIds, gameOpening, resultFromUserSide } from './gameReportData.js';

describe('report game graph data', () => {
  it('maps win, draw, loss and unfinished outcomes from the imported player side', () => {
    expect(resultFromUserSide({ result: '1-0', userColor: 'white' })).toBe('Win');
    expect(resultFromUserSide({ result: '1-0', userColor: 'black' })).toBe('Loss');
    expect(resultFromUserSide({ result: '1/2-1/2', userColor: 'black' })).toBe('Draw');
    expect(resultFromUserSide({ result: '*', userColor: 'white' })).toBe('In progress');
  });

  it('gives each severity a distinct accessible marker shape', () => {
    expect(new Set(Object.values(EVAL_MARKER_SHAPE)).size).toBe(3);
    expect(EVAL_MARKER_SHAPE).toEqual({ Inaccuracy: 'circle', Mistake: 'diamond', Blunder: 'triangle' });
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
    expect(graph.flagged[0].x).toBe(graph.points.find((point) => point.ply === 2).x);
    expect(graph.flagged[0].y).toBe(graph.points.find((point) => point.ply === 2).y);
    expect(Number.isFinite(graph.flagged[0].x)).toBe(true);
    expect(graph.flagged[0].x).toBeGreaterThan(20);
    expect(graph.points.every((point) => point.x >= 20 && point.x <= 740 && point.y >= 20 && point.y <= 230)).toBe(true);
  });

  it('filters the game list by selected node or leak examples', () => {
    const games = [{ url: 'a' }, { url: 'b' }, { url: 'c' }];
    expect(filterGamesByIds(games, ['c', 'a']).map((game) => game.url)).toEqual(['a', 'c']);
    expect(filterGamesByIds(games, null)).toEqual(games);
  });

  it('uses the deepest named ancestor, then falls back to the PGN ECO header', () => {
    const game = { url: 'kings-gambit', headers: { ECO: 'C30' } };
    const rows = [
      { gameKey: game.url, ply: 2, openingContext: { eco: 'C30', name: 'King’s Gambit' } },
      { gameKey: game.url, ply: 4, openingContext: { eco: 'C30', name: 'King’s Gambit Accepted' } },
    ];
    expect(gameOpening(game, rows).label).toBe('C30 · King’s Gambit Accepted');
    expect(gameOpening({ ...game, headers: { ECO: 'C30' } }, []).label).toBe('ECO C30');
  });
});
