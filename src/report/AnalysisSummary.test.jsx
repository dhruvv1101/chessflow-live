import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AnalysisSummary from './AnalysisSummary.jsx';

describe('report analysis summary', () => {
  it('shows flagged moves grouped by game with evaluations and context', () => {
    const games = [
      { url: 'game-1', headers: { White: 'Dhruv', Black: 'Opponent' } },
      { url: 'game-2', headers: { White: 'Other', Black: 'Player' } },
    ];
    const rows = [
      { gameKey: 'game-1', ply: 3, fullmove: 2, playedSan: 'Nf3', classification: 'Inaccuracy', evaluationBefore: { userScore: { cp: 42 } }, evaluationAfter: { userScore: { cp: 10 } }, phase: 'opening', timeContext: 'rushed' },
      { gameKey: 'game-1', ply: 7, fullmove: 4, playedSan: 'Bxd5', classification: 'Blunder', evaluationBefore: { userScore: { mate: 3 } }, evaluationAfter: { userScore: { cp: -250 } }, phase: 'middlegame', timeContext: 'time trouble' },
      { gameKey: 'game-2', ply: 2, fullmove: 1, playedSan: 'e5', classification: 'Good', evaluationBefore: { userScore: { cp: 0 } }, evaluationAfter: { userScore: { cp: 12 } }, phase: 'opening', timeContext: 'had plenty of time' },
    ];

    const markup = renderToStaticMarkup(<AnalysisSummary games={games} rows={rows} />);

    expect(markup).toContain('Dhruv vs Opponent');
    expect(markup).toContain('Move 2');
    expect(markup).toContain('Inaccuracy');
    expect(markup).toContain('+0.42');
    expect(markup).toContain('+0.10');
    expect(markup).toContain('rushed');
    expect(markup).toContain('Mate in 3');
    expect(markup).toContain('-2.50');
    expect(markup).toContain('time trouble');
    expect(markup).not.toContain('e5');
    expect(markup).toContain('No flagged moves');
  });
});
