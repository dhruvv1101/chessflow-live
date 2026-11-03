import React from 'react';

const FLAGGED_CLASSES = new Set(['Inaccuracy', 'Mistake', 'Blunder']);

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

function title(game) {
  return `${game.headers?.White || 'White'} vs ${game.headers?.Black || 'Black'}`;
}

export default function AnalysisSummary({ games, rows }) {
  if (!rows.length) return null;

  return <section className="report-progress" aria-labelledby="analysis-summary-title">
    <h2 id="analysis-summary-title">Analysis summary</h2>
    <p>Moves flagged by Stockfish, with evaluations from your side’s perspective.</p>
    <div className="report-game-list">
      {games.map((game) => {
        const flagged = rows.filter((row) => row.gameKey === game.url && FLAGGED_CLASSES.has(row.classification));
        return <article className="folder-card report-game-card" key={game.url}>
          <h3>{title(game)}</h3>
          {!flagged.length ? <p className="small-meta">No flagged moves.</p> : <div className="report-analysis-table-wrap">
            <table className="report-analysis-table">
              <thead><tr><th scope="col">Move</th><th scope="col">Flag</th><th scope="col">Eval before</th><th scope="col">Eval after</th><th scope="col">Phase</th><th scope="col">Time context</th></tr></thead>
              <tbody>{flagged.map((row) => <tr key={`${row.gameKey}-${row.ply}`}>
                <th scope="row">Move {row.fullmove} · {row.playedSan}</th>
                <td>{row.classification}</td>
                <td>{formatEvaluation(row.evaluationBefore?.userScore)}</td>
                <td>{formatEvaluation(row.evaluationAfter?.userScore)}</td>
                <td>{row.phase}</td>
                <td>{row.timeContext}</td>
              </tr>)}</tbody>
            </table>
          </div>}
        </article>;
      })}
    </div>
  </section>;
}
