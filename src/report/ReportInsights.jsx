import { useState } from 'react';
import { buildMoveExplanation } from './explanations.js';
import RadialOpeningTree from './RadialOpeningTree.jsx';
import { ReportHelpTrigger } from './ReportHelpDrawer.jsx';

function formatChange(value) {
  if (!Number.isFinite(value)) return '—';
  const percent = value * 100;
  return `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`;
}

function lossSummary(leak) {
  return `about ${leak.expectedScoreLoss.toFixed(1)} points lost over ${leak.frequency} occurrences (avg ${Math.round(leak.averageSwing * 100)} percentage points each)`;
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

function LeakCard({ leak, onShowTree, onFilterGames }) {
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

  const firstExample = leak.examples?.[0];

  return <article className="folder-card report-insight-card">
    <p className="meta-line">{leak.kind.replaceAll('-', ' ').toUpperCase()}</p>
    <h3>{leak.title}</h3>
    <p className="small-meta">{lossSummary(leak)} across {leak.gamesAffected} games.</p>
    <div className="report-leak-actions">
      {firstExample && <button className="button button-outline" type="button" aria-expanded={openExample === `${firstExample.gameId}:${firstExample.ply}`} onClick={() => explain(firstExample)}>Explain</button>}
      <button className="button button-outline" type="button" onClick={() => { onShowTree(leak); onFilterGames(leak.examples.map((example) => example.gameId)); }}>Show on tree</button>
    </div>
    {leak.lowConfidence && <span className="review-badge badge-peach report-confidence-badge">Low confidence · fewer than 3 games</span>}
    {leak.kind === 'conversion' && <p className="small-meta">Average lost-advantage swing: {formatChange(leak.averageSwing)}.</p>}
    {leak.kind === 'missed-chance' && <p className="small-meta">Examples include time spent on your reply.</p>}
    {leak.kind === 'time-management' && leak.baseline && <p className="small-meta">Mistakes in {Math.round(leak.baseline.contextRate * 100)}% of {leak.baseline.context} moves vs {Math.round(leak.baseline.normalRate * 100)}% of normal-pace moves (n = {leak.baseline.contextMoves} / {leak.baseline.normalMoves}).</p>}
    <ul className="report-insight-examples">{leak.examples.map((example) => {
      const key = `${example.gameId}:${example.ply}`;
      return <li key={key}>
        <span>{example.move || `Ply ${example.ply}`} · {example.timeContext}{example.replyTimeSeconds != null ? ` · ${example.replyTimeSeconds}s reply` : ''}</span>
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

export default function ReportInsights({ leaks, openingRows, firstMistakes, tree, openingStatus = 'ready', leaksStatus = 'ready', onFilterGames = () => {} }) {
  const [highlightedPositionKeys, setHighlightedPositionKeys] = useState([]);
  const showLeakOnTree = (leak) => {
    const keys = leak.examples.map((example) => example.row?.positionKey || example.row?.fenBefore?.split(' ').slice(0, 4).join(' ')).filter(Boolean);
    setHighlightedPositionKeys(keys);
    document.getElementById('report-radial-tree-title')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  };
  const openingTable = (color, title) => {
    const items = openingRows.filter((opening) => opening.color === color);
    return <section className="report-insight-section" aria-label={`${title} opening performance`}>
      <h4>{title}</h4>
      {items.length ? <div className="report-analysis-table-wrap folder-card report-opening-table-wrap"><table className="report-analysis-table report-opening-table">
        <thead><tr><th scope="col">Opening</th><th scope="col">Games</th><th scope="col">W / D / L</th><th scope="col">Avg. win-probability change</th><th scope="col">Confidence</th></tr></thead>
        <tbody>{items.map((opening) => <tr key={`${color}:${opening.eco}:${opening.name}`}>
          <th scope="row">{opening.eco} · {opening.name}</th><td>{opening.games}</td><td>{opening.wins} / {opening.draws} / {opening.losses}</td>
          <td>{formatChange(opening.averageWinProbabilityChange)}</td><td>{opening.lowConfidence ? <span className="review-badge badge-peach report-confidence-badge">Low confidence</span> : 'Good sample'}</td>
        </tr>)}</tbody>
      </table></div> : <p className="folder-card report-insight-empty">No named openings have enough {color} games for a summary.</p>}
    </section>;
  };
  return <section className="report-insights" aria-labelledby="report-insights-title">
    <div className="section-heading"><div><p className="meta-line">ON-DEVICE ANALYSIS</p><h2 id="report-insights-title">Report insights</h2></div><ReportHelpTrigger label="How to read this report"/></div>
    <section className="report-insight-section" aria-labelledby="report-opening-table-title">
      <RadialOpeningTree tree={tree} leaks={leaks} highlightedPositionKeys={highlightedPositionKeys} status={openingStatus} onShowGames={(gameId) => onFilterGames([gameId])}/>
      <h3 id="report-opening-table-title">Opening performance</h3>
      {openingStatus === 'loading' ? <p className="folder-card report-insight-empty" role="status">Opening tree is being prepared…</p>
        : openingStatus === 'error' ? <p className="folder-card report-insight-empty" role="alert">Opening names are unavailable. Your imported games remain saved.</p>
          : openingStatus === 'empty' ? <p className="folder-card report-insight-empty">No games match these filters.</p> : <>
            {openingTable('white', 'White')}
            {openingTable('black', 'Black')}
          </>}
    </section>
    <section className="report-insight-section" aria-labelledby="report-leaks-title">
      <h3 id="report-leaks-title">Leaks</h3>
      {leaksStatus === 'loading' ? <p className="folder-card report-insight-empty" role="status">Stockfish analysis is in progress…</p>
        : leaksStatus === 'error' ? <p className="folder-card report-insight-empty" role="alert">Stockfish analysis failed. Your imported games are still saved; retry by refreshing this report.</p>
        : leaksStatus === 'empty' ? <p className="folder-card report-insight-empty">No games match these filters.</p>
          : leaks.length ? <div className="report-insight-grid">{leaks.map((leak) => <LeakCard key={leak.id} leak={leak} onShowTree={showLeakOnTree} onFilterGames={onFilterGames}/>)}</div>
            : <p className="folder-card report-insight-empty">No recurring leaks yet. Patterns need at least two games.</p>}
    </section>
    <section className="report-insight-section" aria-labelledby="report-first-mistake-title">
      <h3 id="report-first-mistake-title">First big mistake in lost games</h3>
      {leaksStatus === 'loading' ? <p className="folder-card report-insight-empty" role="status">Waiting for move analysis…</p>
        : leaksStatus === 'error' ? <p className="folder-card report-insight-empty" role="alert">First-mistake summary is unavailable until analysis completes.</p>
          : leaksStatus === 'empty' ? <p className="folder-card report-insight-empty">No games match these filters.</p>
            : !firstMistakes.gamesLost ? <p className="folder-card report-insight-empty">No completed lost games in this report.</p> : <article className="folder-card report-first-mistake-card">
        <p>{firstMistakes.gamesWithFirstMistake} of {firstMistakes.gamesLost} lost games had a qualifying first mistake.</p>
        {firstMistakes.averagePly != null && <p className="small-meta">Average ply {firstMistakes.averagePly.toFixed(1)} · most common phase: {firstMistakes.mostCommonPhase || 'unknown'} · most common tag: {firstMistakes.mostCommonTag || 'none recorded'}.</p>}
        <ul>{firstMistakes.entries.map((entry) => <li key={entry.gameId}>{entry.move} · {entry.phase} · {entry.timeSpentSeconds == null ? 'time unknown' : `${entry.timeSpentSeconds.toFixed(1)}s`} · {entry.tag || 'no tactic tag'}</li>)}</ul>
      </article>}
    </section>
  </section>;
}
