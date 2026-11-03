import { useMemo, useState } from 'react';
import { buildMoveExplanation } from './explanations.js';
import { buildEvalGraphData, EVAL_MARKER_SHAPE } from './gameReportData.js';
import { useLessonActions } from './LessonsFeature.jsx';
import { normalizeLessonFen } from './lessonData.js';
import { ReportHelpTrigger } from './ReportHelpDrawer.jsx';

const CLASS_COLORS = { Inaccuracy: 'var(--yellow)', Mistake: 'var(--amber)', Blunder: 'var(--pink)' };

function score(scoreValue) {
  if (scoreValue?.mate != null) return scoreValue.mate < 0 ? `Mated in ${Math.abs(scoreValue.mate)}` : `Mate in ${scoreValue.mate}`;
  if (!Number.isFinite(scoreValue?.cp)) return 'unavailable';
  return `${scoreValue.cp > 0 ? '+' : ''}${(scoreValue.cp / 100).toFixed(2)}`;
}

export default function EvalGraph({ game, rows }) {
  const { lessons, openLesson } = useLessonActions();
  const graph = useMemo(() => buildEvalGraphData(game, rows), [game, rows]);
  const [selected, setSelected] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectPoint = async (point) => {
    if (!point?.row) return;
    setSelected(point); setExplanation(null); setError(''); setLoading(true);
    try { setExplanation(await buildMoveExplanation(point.row)); }
    catch { setError('Could not open the move explanation right now.'); }
    finally { setLoading(false); }
  };

  return <div className="report-eval-wrap">
    <div className="report-eval-heading"><h4>Evaluation through the game <ReportHelpTrigger label="How to read evaluation and move labels"/></h4><p className="small-meta">Win probability from your side · {graph.points.length - 1} analyzed positions</p></div>
    <svg className="report-eval-graph" viewBox={`0 0 ${graph.width} ${graph.height}`} preserveAspectRatio="none" role="group" aria-label="Game win probability graph, from your perspective">
      {[0, 0.25, 0.5, 0.75, 1].map((value) => {
        const y = 20 + (1 - value) * (graph.height - 40);
        return <g key={value}><line x1="20" x2={graph.width - 20} y1={y} y2={y} className={value === 0.5 ? 'report-eval-even' : 'report-eval-grid'}/><text x="2" y={y + 4} className="report-eval-axis">{Math.round(value * 100)}%</text></g>;
      })}
      <path d={graph.path} className="report-eval-line"/>
      {graph.flagged.map((point) => <g key={point.ply} className={`report-eval-marker is-${point.classification.toLowerCase()}`} role="button" tabIndex="0" data-ply={point.ply} data-x={point.x} data-y={point.y} aria-label={`Move ${point.ply}, ${point.notation || ''}, ${point.classification}, ${Math.round(point.winProbability * 100)} percent win probability. Open explanation.`} onClick={() => selectPoint(point)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectPoint(point); } }}>
        {EVAL_MARKER_SHAPE[point.classification] === 'diamond' ? <rect x={point.x - 6} y={point.y - 6} width="12" height="12" transform={`rotate(45 ${point.x} ${point.y})`} fill={CLASS_COLORS[point.classification]}/> : EVAL_MARKER_SHAPE[point.classification] === 'triangle' ? <path d={`M ${point.x} ${point.y - 8} L ${point.x + 8} ${point.y + 7} L ${point.x - 8} ${point.y + 7} Z`} fill={CLASS_COLORS[point.classification]}/> : <circle cx={point.x} cy={point.y} r="6" fill={CLASS_COLORS[point.classification]}/>}
        {lessons.some((lesson) => lesson.normalizedFen === normalizeLessonFen(point.row.fenBefore) && lesson.playedMove === point.row.playedSan) && <text x={point.x + 8} y={point.y - 7} className="report-eval-note-marker" aria-hidden="true">▣</text>}
        <title>{`${point.notation || `Ply ${point.ply}`} · ${point.classification} · ${Math.round(point.winProbability * 100)}%`}</title>
      </g>)}
    </svg>
    <div className="report-eval-legend" aria-label="Evaluation markers"><span><i className="is-inaccuracy"/>Inaccuracy (circle)</span><span><i className="is-mistake"/>Mistake (diamond)</span><span><i className="is-blunder"/>Blunder (triangle)</span><span><i className="is-even"/>Even position: 50%</span></div>
    {selected && <div className="folder-card report-eval-explanation">
      <div className="report-tree-detail-heading"><div><p className="meta-line">{selected.classification} · {selected.notation}</p><h5>Win probability {Math.round(selected.winProbability * 100)}% · evaluation {score(selected.row.evaluationBefore?.userScore)} → {score(selected.row.evaluationAfter?.userScore)}</h5></div><button className="button button-outline" type="button" onClick={() => setSelected(null)} aria-label="Close move explanation">Close</button></div>
      {loading && <p role="status">Loading move explanation…</p>}{error && <p role="alert">{error}</p>}
      {explanation && <div className="report-insight-explanation"><p><strong>What happened?</strong> {explanation.played} was marked {explanation.classification}.</p><p><strong>Evaluation:</strong> {explanation.evaluationBefore} before → {explanation.evaluationAfter} after.</p><p><strong>Opponent’s best line:</strong> {explanation.opponentLine.join(' ') || explanation.opponentReply || 'No line is available.'}</p><p><strong>Best move:</strong> {explanation.bestMove || 'Not available'} — {explanation.bestMoveIdea}</p><button className="button button-outline" type="button" onClick={() => openLesson(selected.row, game, { kind: 'move' })}>Save as lesson</button></div>}
    </div>}
  </div>;
}
