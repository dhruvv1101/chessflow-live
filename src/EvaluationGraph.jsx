import React from 'react';

const markerColors = { Blunder: 'var(--pink)', Mistake: 'var(--peach)', Inaccuracy: 'var(--yellow)' };

function scoreValue(text = '') {
  if (text.toLowerCase().includes('white mates')) return 6;
  if (text.toLowerCase().includes('black mates')) return -6;
  const value = Number.parseFloat(text);
  return Number.isFinite(value) ? Math.max(-6, Math.min(6, value)) : 0;
}

export default function EvaluationGraph({ rows, currentPly = null, onSelectPly }) {
  if (!rows.length) return null;
  const width = 900, height = 220, inset = 24;
  const plotRows = [{ ply: 0, number: 0, san: 'Starting position', eval: rows[0]?.beforeEvalText || '0.00', label: '—' }, ...rows];
  const points = plotRows.map((row, index) => {
    const x = plotRows.length === 1 ? width / 2 : inset + (index / (plotRows.length - 1)) * (width - 2 * inset);
    const y = inset + ((6 - scoreValue(row.eval)) / 12) * (height - 2 * inset);
    return { ...row, x, y };
  });
  const line = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');

  const cursorPoint = points.find((point) => point.ply === currentPly);
  return <section className="folder-card review-graph-card" aria-labelledby="review-graph-title">
    <div className="folder-tab tab-purple" aria-hidden="true" />
    <div className="folder-head"><div className="icon-box icon-purple" aria-hidden="true">↗</div><div><p className="meta-line">GAME REVIEW · WHITE’S VIEW</p><h2 id="review-graph-title">Evaluation graph</h2></div></div>
    <svg className="evaluation-graph" role="img" aria-label="Evaluation graph across the imported game" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <path d={`M ${inset} ${height / 2} H ${width - inset}`} className="graph-zero" />
      {cursorPoint && <path d={`M ${cursorPoint.x} ${inset} V ${height - inset}`} className="graph-cursor"/>}
      <path d={line} className="graph-line" />
      {points.map((point) => <g key={point.ply} className="graph-point" tabIndex="0" role="button"
        aria-label={`Move ${point.number}, ${point.san}, evaluation ${point.eval}${point.label && point.label !== '—' ? `, ${point.label}` : ''}`}
        onClick={() => onSelectPly?.(point.ply)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectPly?.(point.ply); } }}>
        <title>{`Move ${point.number} · ${point.san} · ${point.eval}${point.label && point.label !== '—' ? ` · ${point.label}` : ''}`}</title>
        <circle cx={point.x} cy={point.y} r={point.label === '—' ? 5 : 8} fill={markerColors[point.label] || 'var(--cream)'} className="graph-dot" />
        {point.label !== '—' && <text x={point.x} y={Math.max(14, point.y - 13)} textAnchor="middle" className="graph-marker">{point.label}</text>}
      </g>)}
    </svg>
    <div className="graph-legend"><span><i className="legend-blunder" />Blunder</span><span><i className="legend-mistake" />Mistake</span><span><i className="legend-inaccuracy" />Inaccuracy</span></div>
  </section>;
}
