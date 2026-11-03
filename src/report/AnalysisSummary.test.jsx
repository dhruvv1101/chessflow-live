import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AnalysisSummary, { filterAnalysisRows } from './AnalysisSummary.jsx';
import { FREE_LIMITS } from './config.js';

describe('report analysis summary', () => {
  it('shows flagged moves grouped by game with evaluations and context', () => {
    const games = [
      { url: 'game-1', headers: { White: 'Dhruv', Black: 'Opponent' }, moves: [{}, {}, {}, {}] },
      { url: 'game-2', headers: { White: 'Other', Black: 'Player' }, moves: [{}] },
    ];
    const rows = [
      { gameKey: 'game-1', ply: 3, fullmove: 2, notation: '2. Nf3', playedSan: 'Nf3', bestMoveSan: 'Nc3', classification: 'Inaccuracy', winProbabilityLoss: 0.1, isUserMove: true, evaluationBefore: { userScore: { cp: 42 } }, evaluationAfter: { userScore: { cp: 10 } }, phase: 'opening', timeContext: 'instant move', timeContextConfidence: 'likely', timeSpentSeconds: 1.2, clockRemainingSeconds: 599.2 },
      { gameKey: 'game-1', ply: 5, fullmove: 3, notation: '3. d3', playedSan: 'd3', classification: 'Inaccuracy', winProbabilityLoss: 0.04, isUserMove: true, phase: 'opening', timeContext: 'unknown' },
      { gameKey: 'game-1', ply: 7, fullmove: 4, notation: '4. Bxd5', playedSan: 'Bxd5', bestMoveSan: 'Qxd5', classification: 'Blunder', winProbabilityLoss: 0.4, isUserMove: true, lostAdvantage: true, evaluationBefore: { userScore: { mate: 3 } }, evaluationAfter: { userScore: { cp: -250 } }, phase: 'middlegame', timeContext: 'low clock', timeContextConfidence: 'likely', timeSpentSeconds: 44, clockRemainingSeconds: 20 },
      { gameKey: 'game-2', ply: 2, fullmove: 1, notation: '1... e5', playedSan: 'e5', bestMoveSan: 'c5', classification: 'Inaccuracy', isUserMove: true, missedChance: { confidence: 'likely', opponentMoveNotation: '1. d4', opponentMoveClassification: 'Blunder', bestReplySan: 'e5', playedSan: 'c5' }, evaluationBefore: { userScore: { cp: 0 } }, evaluationAfter: { userScore: { cp: 12 } }, phase: 'opening', timeContext: 'unknown' },
      { gameKey: 'game-1', ply: 8, fullmove: 4, notation: '4... Nf6', playedSan: 'Nf6', classification: 'Blunder', isUserMove: false, evaluationBefore: { userScore: { cp: 10 } }, evaluationAfter: { userScore: { cp: 250 } }, phase: 'middlegame', timeContext: 'normal pace' },
    ];

    const markup = renderToStaticMarkup(<AnalysisSummary games={games} rows={rows} />);

    expect(markup).toContain('Dhruv vs Opponent');
    expect(markup).toContain('2. Nf3');
    expect(markup).toContain('Inaccuracy');
    expect(markup).toContain('Best move');
    expect(markup).toContain('Nc3');
    expect(markup).toContain('+0.42');
    expect(markup).toContain('+0.10');
    expect(markup).toContain('instant move');
    expect(markup).toContain('likely');
    expect(markup).toContain('Mate in 3');
    expect(markup).toContain('-2.50');
    expect(markup).toContain('low clock');
    expect(markup).toContain('~44s');
    expect(markup).toContain('20s remaining');
    expect(markup).toContain('Lost advantage');
    expect(markup).toContain('Show opponent moves');
    expect(markup).toContain('All flagged (3)');
    expect(markup).toContain('Missed chance · likely');
    expect(markup).toContain('Opponent 1. d4 (Blunder); best reply e5, played c5.');
    expect(markup).not.toContain('4... Nf6');
    expect(markup).toContain('Analyzed 4 of 4 moves.');
    expect(markup).not.toContain('3. d3');
    expect(markup).toContain('small opening inaccuracy');
  });

  it('omits opening inaccuracies below the configured noise floor while retaining other flags', () => {
    expect(FREE_LIMITS.openingNoiseMinWinProbabilityLoss).toBe(0.08);
    const rows = [
      { isUserMove: true, classification: 'Inaccuracy', phase: 'opening', winProbabilityLoss: 0.04 },
      { isUserMove: true, classification: 'Inaccuracy', phase: 'opening', winProbabilityLoss: 0.1 },
      { isUserMove: true, classification: 'Blunder', phase: 'opening', winProbabilityLoss: 0.04, lostAdvantage: true },
    ];
    expect(filterAnalysisRows(rows).map((row) => row.classification)).toEqual(['Inaccuracy', 'Blunder']);
    expect(filterAnalysisRows(rows, 'lost-advantage')).toEqual([rows[2]]);
  });

  it('shows only the imported user’s moves by default and counts opponent moves only when toggled', () => {
    const rows = [
      { isUserMove: true, classification: 'Mistake', lostAdvantage: true },
      { isUserMove: false, classification: 'Blunder', lostAdvantage: true },
    ];
    expect(filterAnalysisRows(rows, 'all', false)).toEqual([rows[0]]);
    expect(filterAnalysisRows(rows, 'all', true)).toEqual(rows);
    expect(filterAnalysisRows(rows, 'Blunder', false)).toEqual([]);
  });

  it('includes a missed chance as a tagged row without changing the mistake categories', () => {
    const row = { isUserMove: true, classification: 'Good', missedChance: { confidence: 'likely' } };
    expect(filterAnalysisRows([row])).toEqual([row]);
    expect(filterAnalysisRows([row], 'Mistake')).toEqual([]);
  });
});
