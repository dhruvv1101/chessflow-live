import React, { useState } from 'react';
import { FREE_LIMITS } from './config.js';

const FLAGGED_CLASSES = ['Inaccuracy', 'Mistake', 'Blunder'];

function formatEvaluation(score) {
  if (!score) return '—';
  if (score.mate != null) {
    const distance = Math.abs(score.mate);
    return score.mate < 0 ? `Mated in ${distance}` : `Mate in ${distance}`;
  }
  if (score.cp == null) return '—';
  const pawns = score.cp / 100;
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(2)}`;
}

function formatSpent(seconds) {
  if (!Number.isFinite(seconds)) return 'unknown';
  const value = Math.round(seconds * 10) / 10;
  return `~${Number.isInteger(value) ? value : value.toFixed(1)}s`;
}

function formatRemaining(seconds) {
  if (!Number.isFinite(seconds)) return 'unknown';
  if (seconds < 60) return `${formatSpent(seconds).replace('~', '')} remaining`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round((seconds - minutes * 60) * 10) / 10;
  return `${minutes}:${String(remainder < 10 ? `0${remainder}` : remainder).padStart(2, '0')} remaining`;
}

function isOpeningNoise(row) {
  return row.phase === 'opening' && row.classification === 'Inaccuracy'
    && Number.isFinite(row.winProbabilityLoss)
    && row.winProbabilityLoss < FREE_LIMITS.openingNoiseMinWinProbabilityLoss;
}

function gameTitle(game) {
  return `${game.headers?.White || 'White'} vs ${game.headers?.Black || 'Black'}`;
}

export function filterAnalysisRows(rows, filter = 'all') {
  const visible = rows.filter((row) => FLAGGED_CLASSES.includes(row.classification) && !isOpeningNoise(row));
  return visible.filter((row) => filter === 'all'
    || (filter === 'lost-advantage' ? row.lostAdvantage : row.classification === filter));
}

export default function AnalysisSummary({ games, rows }) {
  const [filter, setFilter] = useState('all');
  if (!rows.length) return null;

  const noisyOpeningInaccuracies = rows.filter((row) => FLAGGED_CLASSES.includes(row.classification) && isOpeningNoise(row)).length;
  const visibleRows = filterAnalysisRows(rows);
  const counts = Object.fromEntries(FLAGGED_CLASSES.map((classification) => [classification, visibleRows.filter((row) => row.classification === classification).length]));
  counts['lost-advantage'] = visibleRows.filter((row) => row.lostAdvantage).length;
  const filterOptions = [
    { id: 'all', label: 'All flagged', count: visibleRows.length },
    ...FLAGGED_CLASSES.map((classification) => ({ id: classification, label: classification, count: counts[classification] })),
    { id: 'lost-advantage', label: 'Lost advantage', count: counts['lost-advantage'] },
  ];
  const selectedRows = filterAnalysisRows(rows, filter);

  return <section className="report-progress report-analysis-summary" aria-labelledby="analysis-summary-title">
    <h2 id="analysis-summary-title">Analysis summary</h2>
    <p>Stockfish reviewed every move. Evaluations are from the side-to-move’s perspective; elapsed-time values and context labels are likely estimates.</p>
    <div className="report-analysis-filters" role="group" aria-label="Filter analysis summary">
      {filterOptions.map((option) => <button key={option.id} className="button button-outline" type="button" aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}>
        {option.label} ({option.count})
      </button>)}
    </div>
    {noisyOpeningInaccuracies > 0 && <p className="small-meta">{noisyOpeningInaccuracies} small opening {noisyOpeningInaccuracies === 1 ? 'inaccuracy' : 'inaccuracies'} hidden below the configured noise threshold. Their analysis remains available to the tree.</p>}
    <div className="report-game-list">
      {games.map((game) => {
        const allForGame = rows.filter((row) => row.gameKey === game.url);
        const flagged = selectedRows.filter((row) => row.gameKey === game.url);
        return <article className="folder-card report-game-card" key={game.url}>
          <h3>{gameTitle(game)}</h3>
          <p className="small-meta">Analyzed {allForGame.length} of {game.moves?.length || 0} moves.</p>
          {!flagged.length ? <p className="small-meta">No flagged moves for this filter.</p> : <div className="report-analysis-table-wrap">
            <table className="report-analysis-table">
              <thead><tr><th scope="col">Move</th><th scope="col">Flag</th><th scope="col">Best move</th><th scope="col">Eval before</th><th scope="col">Eval after</th><th scope="col">Phase</th><th scope="col">Time spent (likely)</th><th scope="col">Clock remaining</th><th scope="col">Time context</th></tr></thead>
              <tbody>{flagged.map((row) => <tr key={`${row.gameKey}-${row.ply}`}>
                <th scope="row">{row.notation || `Move ${row.fullmove} ${row.playedSan}`}</th>
                <td>{row.classification}{row.lostAdvantage && <span className="report-lost-advantage"> · Lost advantage</span>}</td>
                <td>{row.bestMoveSan || '—'}</td>
                <td>{formatEvaluation(row.evaluationBefore?.userScore)}</td>
                <td>{formatEvaluation(row.evaluationAfter?.userScore)}</td>
                <td>{row.phase}</td>
                <td>{formatSpent(row.timeSpentSeconds)}</td>
                <td>{formatRemaining(row.clockRemainingSeconds)}</td>
                <td>{row.timeContext === 'unknown' ? 'unknown' : `${row.timeContextConfidence === 'likely' ? 'likely · ' : ''}${row.timeContext}`}</td>
              </tr>)}</tbody>
            </table>
          </div>}
        </article>;
      })}
    </div>
  </section>;
}
