import { useState } from 'react';

const badgeClass = (label) => `analysis-classification-${String(label || 'unrated').toLowerCase()}`;

export default function ChessAnalysisPanel({ row, coach, onExplain, onShowOpponentPlan, onShowBetterMove, onPractice }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  if (!row) return <section className="folder-card coach-panel"><p className="meta-line">MOVE COACH</p><h2>Choose a move to review</h2><p className="small-meta">Click a move or an evaluation-graph point to see its Stockfish analysis.</p></section>;
  const explanation = coach.explanation;
  const severe = ['Inaccuracy', 'Mistake', 'Blunder'].includes(row.label);
  return <section className="folder-card coach-panel" aria-labelledby="coach-panel-title">
    <div className="folder-head"><div className="icon-box icon-purple" aria-hidden="true">AI</div><div><p className="meta-line">MOVE {row.number}{row.color === 'w' ? ' · WHITE' : ' · BLACK'}</p><h2 id="coach-panel-title">Chess coach</h2></div><span className={`analysis-classification ${badgeClass(row.label)}`}>{row.label}</span></div>
    <p className="coach-summary"><strong>{row.san}</strong> · evaluation loss <strong>{row.lossCp} cp</strong>{row.depth ? ` · depth ${row.depth}` : ''}</p>
    <div className="coach-actions">
      <button className="button button-yellow" onClick={onExplain} disabled={coach.state === 'loading'}>{coach.state === 'loading' ? 'Explaining…' : 'Explain This Move'}</button>
      <button className="button button-outline" onClick={() => { setDetailsOpen(true); onShowOpponentPlan(row); }}>Show Opponent’s Plan</button>
      <button className="button button-outline" onClick={() => { setDetailsOpen(true); onShowBetterMove(row); }}>Show Better Move</button>
      <button className="button button-outline" onClick={() => onPractice(row)} disabled={!severe}>Practice This Mistake</button>
    </div>
    {coach.error && <p className="coach-fallback" role="status">{coach.error} Stockfish lines are shown below.</p>}
    {explanation && <div className="coach-explanation" aria-live="polite">
      <section><h3>What happened?</h3><p>{explanation.what_happened}</p></section>
      <section><h3>Why was it a mistake?</h3><p>{explanation.why_bad}</p></section>
      <section><h3>Opponent’s best response</h3><p>{row.opponentSan || 'No legal response line available.'} — {explanation.opponent_punishment}</p></section>
      <section><h3>How the position deteriorates</h3><p>{explanation.position_deterioration}</p><p className="verified-line"><strong>Verified engine line:</strong> {explanation.punishment_line?.join(' ') || row.punishmentSan?.join(' ') || 'No continuation available.'}</p></section>
      <section><h3>Best alternative</h3><p>{row.bestSan} — {row.variations?.[0]?.san?.slice(0, 4).join(' ')}</p></section>
      <section><h3>Tactical idea / winning plan</h3><p>{explanation.tactical_idea} {explanation.winning_plan}</p></section>
      <section><h3>Lesson to remember</h3><p>{explanation.lesson}</p></section>
      <section><h3>Elo improvement tip</h3><p>{explanation.elo_tip}</p></section>
    </div>}
    {coach.state === 'idle' && severe && <p className="small-meta">An explanation is requested for this inaccuracy, mistake or blunder. Moves and lines below are verified by Stockfish.</p>}
    <details open={detailsOpen} onToggle={(event) => setDetailsOpen(event.currentTarget.open)} className="coach-engine-details">
      <summary>Stockfish evidence and alternatives</summary>
      <p>Best move: <strong>{row.bestSan}</strong> · played: <strong>{row.san}</strong> · before {row.beforeEvalText || '—'} · after {row.eval}</p>
      <p><strong>Verified opponent continuation:</strong> {row.punishmentSan?.join(' ') || row.opponentSan || 'No continuation available.'}</p>
      <ol>{(row.variations || []).slice(0, 3).map((line, index) => <li key={`${line.uci?.[0]}-${index}`}><strong>{line.san?.[0] || '—'}</strong> {line.san?.slice(1, 6).join(' ')} <span>{line.cp == null ? '' : `${(line.cp / 100).toFixed(2)} White`}</span></li>)}</ol>
      <p className="small-meta">Opening names and trap claims are omitted because no opening database is configured.</p>
    </details>
  </section>;
}
