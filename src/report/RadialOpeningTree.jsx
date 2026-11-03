import { useEffect, useMemo, useRef, useState } from 'react';
import { FREE_LIMITS } from './config.js';
import { buildRadialLayout, moveTreeSelection, visibleTreeTable } from './radialLayout.js';

const PIECES = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

function ReadOnlyFen({ fen }) {
  const placement = String(fen || '').split(' ')[0] || '';
  const rows = placement.split('/');
  return <div className="report-fen-board" role="grid" aria-label="Selected position board">
    {rows.map((row, rank) => {
      const squares = [];
      for (const char of row) {
        if (/\d/.test(char)) for (let count = 0; count < Number(char); count += 1) squares.push('');
        else squares.push(char);
      }
      return squares.map((piece, file) => <span role="gridcell" aria-label={`${String.fromCharCode(97 + file)}${8 - rank}${piece ? ` ${piece}` : ' empty'}`} className={`report-fen-square ${(file + rank) % 2 ? 'is-dark' : 'is-light'} ${piece ? (piece === piece.toUpperCase() ? 'piece-white' : 'piece-black') : ''}`} key={`${rank}:${file}`}>{PIECES[piece] || ''}</span>);
    })}
  </div>;
}

function describe(node) {
  return `${node.move || node.name}, ${node.games} games, ${node.wins}-${node.draws}-${node.losses}, average win probability change ${Number.isFinite(node.averageWinProbabilityChange) ? `${Math.round(node.averageWinProbabilityChange * 100)} percentage points` : 'unavailable'}, mistake rate ${Math.round((node.mistakeRate || 0) * 100)} percent`;
}

export default function RadialOpeningTree({ tree, leaks = [], highlightedPositionKeys = [], status = 'ready', onShowGames }) {
  const [color, setColor] = useState('white');
  const [maxDepth, setMaxDepth] = useState(12);
  const [showLowConfidence, setShowLowConfidence] = useState(false);
  const [tableView, setTableView] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [drag, setDrag] = useState(null);
  const lastHighlightRef = useRef('');
  const layout = useMemo(() => buildRadialLayout(tree, { color, maxDepth, showLowConfidence }), [tree, color, maxDepth, showLowConfidence]);
  const tableNodes = useMemo(() => visibleTreeTable(layout), [layout]);
  const selected = layout.nodes.find((node) => node.id === selectedId) || null;
  useEffect(() => {
    if (!highlightedPositionKeys.length) { lastHighlightRef.current = null; return; }
    if (lastHighlightRef.current === highlightedPositionKeys) return;
    lastHighlightRef.current = highlightedPositionKeys;
    const highlight = tree?.nodes?.find((node) => highlightedPositionKeys.includes(node.positionKey));
    if (highlight && highlight.color !== color) setColor(highlight.color);
  }, [highlightedPositionKeys, tree, color]);
  const maxLinkGames = Math.max(1, ...layout.links.map((link) => link.games));
  const touchingLeaks = selected ? leaks.filter((leak) => leak.examples?.some((example) => example.row?.positionKey === selected.positionKey || example.row?.fenBefore?.split(' ').slice(0, 4).join(' ') === selected.positionKey)) : [];
  const renderTreeRows = (parentId = null) => {
    const children = tableNodes.filter((node) => (node.parentId || null) === parentId);
    if (!children.length) return null;
    return <ul className="report-tree-table">{children.map((node) => <li key={node.id} role="treeitem" aria-level={node.depth}>
      <button type="button" className="button button-outline" onClick={() => setSelectedId(node.id)} aria-label={`Select ${describe(node)}`}>{node.move || node.name} · {node.games} games{node.lowConfidence ? ' · Low confidence' : ''}{node.weakestMoveCount > 0 ? ' · Leak' : ''}</button>
      {renderTreeRows(node.id)}
    </li>)}</ul>;
  };
  const adjustZoom = (factor) => setTransform((current) => ({ ...current, scale: Math.max(0.6, Math.min(2.5, current.scale * factor)) }));
  const selectByKeyboard = (event, node) => {
    if (event.key === 'Escape') { event.preventDefault(); setSelectedId(null); return; }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(node.id); return; }
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const next = moveTreeSelection(layout.nodes, node.id, event.key);
    if (next) {
      setSelectedId(next);
      requestAnimationFrame(() => document.querySelector(`[data-tree-node="${CSS.escape(next)}"]`)?.focus());
    }
  };
  const startDrag = (event) => { if (event.target === event.currentTarget) setDrag({ x: event.clientX, y: event.clientY, baseX: transform.x, baseY: transform.y }); };
  const moveDrag = (event) => { if (drag) setTransform((current) => ({ ...current, x: drag.baseX + event.clientX - drag.x, y: drag.baseY + event.clientY - drag.y })); };

  return <section className="report-tree-section" aria-labelledby="report-radial-tree-title" onKeyDown={(event) => { if (event.key === 'Escape' && selectedId) setSelectedId(null); }}>
    <div className="report-tree-heading"><div><p className="meta-line">POSITIONS FROM YOUR IMPORTED GAMES</p><h3 id="report-radial-tree-title">Opening tree</h3></div>
      {status === 'ready' && <div className="report-tree-side-toggle" role="group" aria-label="Tree side">
        {['white', 'black'].map((side) => <button type="button" className={`button ${color === side ? 'button-yellow' : 'button-outline'}`} aria-pressed={color === side} onClick={() => { setColor(side); setSelectedId(null); }} key={side}>{side === 'white' ? 'White' : 'Black'}</button>)}
      </div>}
    </div>
    {status === 'loading' ? <p className="folder-card report-insight-empty" role="status">Opening tree is being prepared…</p>
      : status === 'error' ? <p className="folder-card report-insight-empty" role="alert">Opening data could not be loaded. Imported games remain available.</p>
        : status === 'empty' || !tree?.nodes?.length ? <p className="folder-card report-insight-empty">No positions are ready for this side yet.</p> : <>
          <div className="report-tree-controls">
            <label className="setting-select">Visible depth <input type="range" min="1" max="24" value={maxDepth} onChange={(event) => setMaxDepth(Number(event.target.value))}/><span>{maxDepth} plies</span></label>
            <label className="report-tree-check"><input type="checkbox" checked={showLowConfidence} onChange={(event) => setShowLowConfidence(event.target.checked)}/> Show below-minimum lines</label>
            <button className="button button-outline" type="button" aria-pressed={tableView} onClick={() => setTableView((value) => !value)}>{tableView ? 'Radial view' : 'Table view'}</button>
            {!tableView && <div className="report-tree-zoom" aria-label="Tree zoom controls"><button className="button button-outline" type="button" aria-label="Zoom in" onClick={() => adjustZoom(1.2)}>+</button><button className="button button-outline" type="button" aria-label="Zoom out" onClick={() => adjustZoom(1 / 1.2)}>−</button><button className="button button-outline" type="button" onClick={() => setTransform({ x: 0, y: 0, scale: 1 })}>Reset</button></div>}
          </div>
          <div className={`report-tree-view-layout${selected ? ' has-selection' : ''}`}>
          <div className="report-tree-card folder-card">
            {tableView ? tableNodes.length ? <div className="report-tree-table-wrap" role="tree" aria-label={`${color} position tree`}>{renderTreeRows()}</div> : <p>No positions meet the sample and depth filters.</p> : <svg className="report-radial-svg" viewBox={`0 0 ${layout.width} ${layout.width}`} role="group" aria-label={`${color} radial opening tree`} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)} onPointerLeave={() => setDrag(null)} onWheel={(event) => { event.preventDefault(); adjustZoom(event.deltaY < 0 ? 1.08 : 1 / 1.08); }}>
              <g transform={`translate(${transform.x} ${transform.y}) translate(${layout.center} ${layout.center}) scale(${transform.scale}) translate(${-layout.center} ${-layout.center})`}>
                {layout.rings.map((ring) => <circle key={ring.depth} cx={layout.center} cy={layout.center} r={ring.radius} className="report-tree-ring"><title>{`Ply ${ring.depth}`}</title></circle>)}
                {layout.links.map((link, index) => <line key={`${link.source.id}:${link.target.id}:${index}`} x1={link.source.x} y1={link.source.y} x2={link.target.x} y2={link.target.y} className="report-tree-link" strokeWidth={1 + 5 * Math.sqrt(link.games / maxLinkGames)} aria-hidden="true"><title>{`${link.move}: ${link.games} games`}</title></line>)}
                {layout.nodes.map((node) => {
                  const isLeak = leaks.some((leak) => leak.examples?.some((example) => example.row?.positionKey === node.positionKey || example.row?.fenBefore?.split(' ').slice(0, 4).join(' ') === node.positionKey));
                  const isHighlighted = highlightedPositionKeys.includes(node.positionKey);
                  const isMajor = node.games >= FREE_LIMITS.reportInsights.lowConfidenceGames;
                  return <g key={node.id} className="report-tree-node" role="button" tabIndex={node.depth ? 0 : -1} data-tree-node={node.id} aria-label={describe(node)} aria-pressed={selectedId === node.id} onClick={() => setSelectedId(node.id)} onKeyDown={(event) => selectByKeyboard(event, node)}>
                    <circle cx={node.x} cy={node.y} r={node.radius} fill={node.fill} className={`${node.lowConfidence ? 'is-low-confidence' : ''} ${isLeak ? 'is-leak' : ''} ${isHighlighted ? 'is-highlighted' : ''} ${selectedId === node.id ? 'is-selected' : ''}`}/>
                    <title>{describe(node)}</title>
                    {isMajor && node.openingName && <text x={node.x + node.radius + 4} y={node.y - 3} className="report-tree-label">{node.eco} · {node.openingName}</text>}
                    {isLeak && <circle cx={node.x + node.radius * .72} cy={node.y - node.radius * .72} r="3" className="report-tree-leak-marker" aria-hidden="true"/>}
                  </g>;
                })}
              </g>
            </svg>}
            <div className="report-tree-legend" aria-label="Tree legend"><span><i className="report-legend-good"/> Better result/eval</span><span><i className="report-legend-bad"/> Worse result/eval</span><span><i className="report-legend-leak"/> Leak position</span><span><i className="report-legend-low"/> Low confidence</span></div>
          </div>
          {selected && <aside className="folder-card report-tree-detail" aria-label="Selected position details">
            <div className="report-tree-detail-heading"><div><p className="meta-line">{selected.eco || `PLY ${selected.depthPly ?? selected.depth}`}</p><h4>{selected.openingName || selected.move || selected.name}</h4></div><button className="button button-outline" type="button" onClick={() => setSelectedId(null)} aria-label="Close position details">Close</button></div>
            <ReadOnlyFen fen={`${selected.positionKey} 0 1`}/>
            <p>Games {selected.games} · W/D/L {selected.wins}/{selected.draws}/{selected.losses}</p>
            <p>Average win-probability change: {Number.isFinite(selected.averageWinProbabilityChange) ? `${Math.round(selected.averageWinProbabilityChange * 100)} percentage points` : 'unavailable'} · Mistake rate {Math.round((selected.mistakeRate || 0) * 100)}%</p>
            {touchingLeaks.length > 0 && <div><strong>Related leaks</strong><ul>{touchingLeaks.map((leak) => <li key={leak.id}>{leak.title}</li>)}</ul></div>}
            <div><strong>Example games</strong><ul>{selected.exampleGameIds?.map((gameId) => <li key={gameId}><a href="#report-games-title" onClick={(event) => { event.preventDefault(); onShowGames?.(gameId); document.getElementById('report-games-title')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); }}>Show game {gameId}</a></li>)}</ul></div>
            <button className="button button-outline" type="button" disabled aria-describedby="report-training-next">Train this line</button><p id="report-training-next" className="small-meta">Training arrives in the next update.</p>
          </aside>}
          </div>
        </>}
  </section>;
}
