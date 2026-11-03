import { useState } from 'react';
import { buildMoveExplanation } from './explanations.js';

function formatChange(value) {
  if (!Number.isFinite(value)) return '—';
  const percent = value * 100;
  return `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`;
}

function ExplanationDetails({ explanation }) {
  return <div className="report-insight-explanation">
    <p><strong>What happened?</strong> {explanation.played} was marked {explanation.classification}.</p>
    <p><strong>Evaluation:</strong> {explanation.evaluationBefore} before → {explanation.evaluationAfter} after.</p>
    <p><strong>Why?</strong> {explanation.why}</p>
    <p><strong>Opponent’s best line:</strong> {explanation.opponentLine.length ? explanation.opponentLine.join(' ') : explanation.opponentReply || 'No line is available yet.'}</p>
    <p><strong>Best alternative:</strong> {explanation.bestMove || 'No best move stored.'} — {explanation.bestMoveIdea}</p>
    {explanation.tacticalContext.map((context) => <p key={context}><strong>Likely tactic:</strong> {context}</p>)}
    {explanation.opponentContext && <p><strong>Opponent context:</strong> {explanation.opponentContext}</p>}
  </div>;
}

function LeakCard({ leak }) {
  const [openExample, setOpenExample] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const explain = async (example) => {
    const key = `${example.gameId}:${example.ply}`;
    if (openExample === key) { setOpenExample(null); return; }
    setOpenExample(key);
    setExplanation(null);
    setError('');
    setLoading(true);
    try { setExplanation(await buildMoveExplanation(example.row)); }
    catch { setError('Could not load an engine line for this move.'); }
    finally { setLoading(false); }
  };

  return <article className="folder-card report-insight-card">
    <p className="meta-line">{leak.kind.replaceAll('-', ' ').toUpperCase()}</p>
    <h3>{leak.title}</h3>
    <p className="small-meta">{leak.frequency} occurrences across {leak.gamesAffected} games · expected-score loss {formatChange(leak.expectedScoreLoss)} · impact {leak.score.toFixed(3)}</p>
    {leak.lowConfidence && <span className="review-badge badge-peach report-confidence-badge">Low confidence · fewer than 3 games</span>}
    {leak.kind === 'conversion' && <p className="small-meta">Average lost-advantage swing: {formatChange(leak.averageSwing)}.</p>}
    {leak.kind === 'missed-chance' && <p className="small-meta">Examples include time spent on your reply.</p>}
    <ul className="report-insight-examples">{leak.examples.map((example) => {
      const key = `${example.gameId}:${example.ply}`;
      return <li key={key}>
        <span>{example.move || `Ply ${example.ply}`} · {example.playedSan} · {example.timeContext}{example.replyTimeSeconds != null ? ` · ${example.replyTimeSeconds}s reply` : ''}</span>
        <button className="button button-outline" type="button" aria-expanded={openExample === key} onClick={() => explain(example)}>
          {openExample === key ? 'Hide explanation' : 'Explain example'}
        </button>
        {openExample === key && <div className="report-insight-explanation-wrap">
          {loading && <p role="status">Loading engine line…</p>}
          {error && <p role="alert">{error}</p>}
          {explanation && <ExplanationDetails explanation={explanation}/>}
        </div>}
      </li>;
    })}</ul>
  </article>;
}

export default function ReportInsights({ leaks, openingRows, firstMistakes }) {
  return <section className="report-insights" aria-labelledby="report-insights-title">
    <div className="section-heading"><div><p className="meta-line">ON-DEVICE ANALYSIS</p><h2 id="report-insights-title">Opening tree &amp; recurring leaks</h2></div></div>
    <section className="report-insight-section" aria-labelledby="report-leaks-title">
      <h3 id="report-leaks-title">Top leaks</h3>
      {leaks.length ? <div className="report-insight-grid">{leaks.map((leak) => <LeakCard key={leak.id} leak={leak}/>)}</div>
        : <p className="folder-card report-insight-empty">No recurring leaks yet. Patterns need at least two games.</p>}
    </section>
    <section className="report-insight-section" aria-labelledby="report-opening-table-title">
      <h3 id="report-opening-table-title">Opening performance</h3>
      {openingRows.length ? <div className="report-analysis-table-wrap folder-card report-opening-table-wrap"><table className="report-analysis-table report-opening-table">
        <thead><tr><th scope="col">Opening</th><th scope="col">Games</th><th scope="col">W / D / L</th><th scope="col">Avg. win-probability change</th><th scope="col">Confidence</th></tr></thead>
        <tbody>{openingRows.map((opening) => <tr key={`${opening.eco}:${opening.name}`}>
          <th scope="row">{opening.eco} · {opening.name}</th><td>{opening.games}</td><td>{opening.wins} / {opening.draws} / {opening.losses}</td>
          <td>{formatChange(opening.averageWinProbabilityChange)}</td><td>{opening.lowConfidence ? <span className="review-badge badge-peach report-confidence-badge">Low confidence</span> : 'Good sample'}</td>
        </tr>)}</tbody>
      </table></div> : <p className="folder-card report-insight-empty">No named opening positions have enough games for a summary yet.</p>}
    </section>
    <section className="report-insight-section" aria-labelledby="report-first-mistake-title">
      <h3 id="report-first-mistake-title">First big mistake in lost games</h3>
      {!firstMistakes.gamesLost ? <p className="folder-card report-insight-empty">No completed lost games in this report.</p> : <article className="folder-card report-first-mistake-card">
        <p>{firstMistakes.gamesWithFirstMistake} of {firstMistakes.gamesLost} lost games had a qualifying first mistake.</p>
        {firstMistakes.averagePly != null && <p className="small-meta">Average ply {firstMistakes.averagePly.toFixed(1)} · most common phase: {firstMistakes.mostCommonPhase || 'unknown'} · most common tag: {firstMistakes.mostCommonTag || 'none recorded'}.</p>}
        <ul>{firstMistakes.entries.map((entry) => <li key={entry.gameId}>{entry.move} · {entry.phase} · {entry.timeSpentSeconds == null ? 'time unknown' : `${entry.timeSpentSeconds.toFixed(1)}s`} · {entry.tag || 'no tactic tag'}</li>)}</ul>
      </article>}
    </section>
  </section>;
}
