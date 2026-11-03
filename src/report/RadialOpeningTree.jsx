import { useEffect, useMemo, useRef, useState } from 'react';
import { useEntitlement } from './useEntitlement.js';
import { buildRadialLayout, fitRadialView, moveTreeSelection, treePathIds, visibleTreeTable } from './radialLayout.js';
import { ReportHelpTrigger } from './ReportHelpDrawer.jsx';
import { useLessonActions } from './LessonsFeature.jsx';
import { normalizeLessonFen } from './lessonData.js';

const PIECES = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

function ReadOnlyFen({ fen, color, lastMoveUci }) {
  const placement = String(fen || '').split(' ')[0] || '';
  const rows = placement.split('/');
  const lastSquares = new Set(lastMoveUci && lastMoveUci.length >= 4 ? [lastMoveUci.slice(0, 2), lastMoveUci.slice(2, 4)] : []);
  const ranks = Array.from({ length: 8 }, (_, index) => color === 'white' ? index : 7 - index);
  return <div className="report-fen-board" role="grid" aria-label={'Position preview, ' + color + ' at the bottom'}>
    {ranks.map((rankIndex) => {
      const row = rows[rankIndex] || '';
      const squares = [];
      for (const char of row) {
        if (/\d/.test(char)) for (let count = 0; count < Number(char); count += 1) squares.push('');
        else squares.push(char);
      }
      const files = Array.from({ length: 8 }, (_, index) => color === 'white' ? index : 7 - index);
      return files.map((fileIndex) => {
        const piece = squares[fileIndex] || '';
        const file = String.fromCharCode(97 + fileIndex);
        const rank = String(8 - rankIndex);
        const square = file + rank;
        const light = (fileIndex + rankIndex) % 2 === 0;
        const pieceClass = piece ? (piece === piece.toUpperCase() ? ' piece-white' : ' piece-black') : '';
        return <span role="gridcell" aria-label={square + (piece ? ' ' + piece : ' empty')} className={'report-fen-square ' + (light ? 'is-light' : 'is-dark') + pieceClass + (lastSquares.has(square) ? ' is-last-move' : '')} key={square}>{PIECES[piece] || ''}</span>;
      });
    })}
  </div>;
}

function describe(node) {
  if (node.tail) return node.label + '. Select to expand this one-game line.';
  const change = Number.isFinite(node.averageWinProbabilityChange) ? Math.round(node.averageWinProbabilityChange * 100) + ' points' : 'unavailable';
  return (node.label || node.name) + ', ' + node.games + ' games, ' + node.wins + '-' + node.draws + '-' + node.losses + ', average chance change ' + change + ', mistake rate ' + Math.round((node.mistakeRate || 0) * 100) + ' percent';
}

function moveLabel(move) {
  return String(move || '').replace(/^(\d+)\.(\.\.)?\s*/, (_, number, black) => number + (black ? '...' : '.'));
}

export default function RadialOpeningTree({ tree, leaks = [], highlightedPositionKeys = [], status = 'ready', onShowGames, onSaveLesson }) {
  const { limits } = useEntitlement();
  const { lessons, openLesson } = useLessonActions();
  const [color, setColor] = useState('white');
  const [maxDepth, setMaxDepth] = useState(limits.reportInsights.initialTreeDepth);
  const [showLowConfidence, setShowLowConfidence] = useState(false);
  const [tableView, setTableView] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [expandedTailIds, setExpandedTailIds] = useState([]);
  const [views, setViews] = useState({ white: null, black: null });
  const [viewport, setViewport] = useState({ width: 760, height: 760 });
  const [drag, setDrag] = useState(null);
  const svgRef = useRef(null);
  const viewportRef = useRef(viewport);
  const lastHighlightRef = useRef(null);
  const layout = useMemo(() => buildRadialLayout(tree, {
    color, maxDepth, showLowConfidence, minimumSampleGames: limits.reportInsights.minimumSampleGames, expandedTailIds,
  }), [tree, color, maxDepth, showLowConfidence, limits.reportInsights.minimumSampleGames, expandedTailIds]);
  const tableNodes = useMemo(() => visibleTreeTable(layout), [layout]);
  const selected = layout.nodes.find((node) => node.id === selectedId) || null;
  const fitted = useMemo(() => fitRadialView(layout, viewport), [layout, viewport]);
  const transform = views[color] || fitted;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setViewport({ width, height });
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, [status, tableView]);

  useEffect(() => {
    const resized = viewport.width !== viewportRef.current.width || viewport.height !== viewportRef.current.height;
    viewportRef.current = viewport;
    if (tableView || status !== 'ready' || (views[color] && !resized)) return;
    setViews((current) => ({ ...current, [color]: fitted }));
  }, [fitted, color, tableView, status, viewport, views, views[color]]);

  useEffect(() => { setViews({ white: null, black: null }); }, [tree]);

  useEffect(() => {
    if (!highlightedPositionKeys.length) { lastHighlightRef.current = null; return; }
    if (lastHighlightRef.current === highlightedPositionKeys) return;
    lastHighlightRef.current = highlightedPositionKeys;
    const highlight = tree && tree.nodes && tree.nodes.find((node) => highlightedPositionKeys.includes(node.positionKey));
    if (highlight && highlight.color !== color) {
      setColor(highlight.color);
      setViews((current) => ({ ...current, [highlight.color]: null }));
    }
  }, [highlightedPositionKeys, tree, color]);

  const maxLinkGames = Math.max(1, ...layout.links.map((link) => link.games));
  const touchingLeaks = selected ? leaks.filter((leak) => leak.examples && leak.examples.some((example) => example.row && (example.row.positionKey === selected.positionKey || example.row.fenBefore && example.row.fenBefore.split(' ').slice(0, 4).join(' ') === selected.positionKey))) : [];
  const pathIds = useMemo(() => {
    const ids = new Set();
    if (selectedId) treePathIds(layout.nodes, selectedId).forEach((id) => ids.add(id));
    if (hoveredId) treePathIds(layout.nodes, hoveredId).forEach((id) => ids.add(id));
    return ids;
  }, [layout.nodes, selectedId, hoveredId]);
  const maxNodeGames = Math.max(1, ...layout.nodes.map((node) => node.games || 0));
  const labelThreshold = transform.scale < 0.75 ? Math.max(limits.reportInsights.minimumSampleGames, Math.ceil(maxNodeGames * 0.7)) : limits.reportInsights.minimumSampleGames;

  function renderTreeRows(parentId = layout.root.id) {
    const children = tableNodes.filter((node) => (node.parentId || null) === parentId);
    if (!children.length) return null;
    return <ul className="report-tree-table">{children.map((node) => <li key={node.id} role="treeitem" aria-level={node.depth}>
      <button type="button" className="button button-outline" onClick={() => node.tail ? toggleTail(node.id) : setSelectedId(node.id)} aria-label={node.tail ? describe(node) : 'Select ' + describe(node)}>{node.label || node.name} · {node.games} games{node.lowConfidence ? ' · Low confidence' : ''}{node.weakestMoveCount > 0 ? ' · Leak' : ''}</button>
      {renderTreeRows(node.id)}
    </li>)}</ul>;
  }

  function fitFor(side = color, depth = maxDepth) {
    const nextLayout = buildRadialLayout(tree, {
      color: side, maxDepth: depth, showLowConfidence,
      minimumSampleGames: limits.reportInsights.minimumSampleGames, expandedTailIds,
    });
    return fitRadialView(nextLayout, viewport);
  }

  function toggleTail(id) {
    setExpandedTailIds((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
    setSelectedId(null);
    setViews((current) => ({ ...current, [color]: null }));
  }

  function changeDepth(depth) {
    setMaxDepth(depth);
    setSelectedId(null);
    setViews((current) => ({ ...current, [color]: fitFor(color, depth) }));
  }

  function switchSide(side) {
    if (side === color) return;
    setColor(side);
    setSelectedId(null);
    if (!views[side]) setViews((current) => ({ ...current, [side]: fitFor(side) }));
  }

  const adjustZoom = (factor) => setViews((current) => ({ ...current, [color]: { ...transform, scale: Math.max(0.55, Math.min(2.5, transform.scale * factor)) } }));
  const resetFit = () => setViews((current) => ({ ...current, [color]: fitFor() }));
  const selectByKeyboard = (event, node) => {
    if (event.key === 'Escape') { event.preventDefault(); setSelectedId(null); return; }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (node.tail) toggleTail(node.id);
      else setSelectedId(node.id);
      return;
    }
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const next = moveTreeSelection(layout.nodes, node.id, event.key);
    if (next) {
      setSelectedId(next);
      requestAnimationFrame(() => document.querySelector('[data-tree-node="' + CSS.escape(next) + '"]')?.focus());
    }
  };
  const selectRootByKeyboard = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); setSelectedId(null); return; }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(null); return; }
    const next = moveTreeSelection(layout.nodes, layout.root.id, event.key);
    if (next && next !== layout.root.id) {
      event.preventDefault();
      setSelectedId(next);
      requestAnimationFrame(() => document.querySelector('[data-tree-node="' + CSS.escape(next) + '"]')?.focus());
    }
  };
  const startDrag = (event) => {
    if (event.target === event.currentTarget) setDrag({ x: event.clientX, y: event.clientY, baseX: transform.x, baseY: transform.y });
  };
  const moveDrag = (event) => {
    if (!drag) return;
    const scaleX = layout.width / Math.max(1, viewport.width);
    const scaleY = layout.height / Math.max(1, viewport.height);
    setViews((current) => ({ ...current, [color]: { ...transform, x: drag.baseX + (event.clientX - drag.x) * scaleX, y: drag.baseY + (event.clientY - drag.y) * scaleY } }));
  };

  return <section className="report-tree-section" aria-labelledby="report-radial-tree-title" onKeyDown={(event) => { if (event.key === 'Escape' && selectedId) setSelectedId(null); }}>
    <div className="report-tree-heading"><div><p className="meta-line">POSITIONS FROM YOUR IMPORTED GAMES</p><h3 id="report-radial-tree-title">Opening tree</h3></div>
      {status === 'ready' && <div className="report-tree-side-toggle" role="group" aria-label="Tree side">
        <ReportHelpTrigger label="How to use tree side and zoom controls"/>
        {['white', 'black'].map((side) => <button type="button" className={'button ' + (color === side ? 'button-yellow' : 'button-outline')} aria-pressed={color === side} onClick={() => switchSide(side)} key={side}>{side === 'white' ? 'White' : 'Black'}</button>)}
      </div>}
    </div>
    {status === 'loading' ? <p className="folder-card report-insight-empty" role="status">Opening tree is being prepared…</p>
      : status === 'error' ? <p className="folder-card report-insight-empty" role="alert">Opening data could not be loaded. Imported games remain available.</p>
        : status === 'empty' || !tree || !tree.nodes || !tree.nodes.length ? <p className="folder-card report-insight-empty">No positions are ready for this side yet.</p> : <>
          <div className="report-tree-controls">
            <label className="setting-select">Visible depth <ReportHelpTrigger label="What visible depth means"/><input aria-label="Visible depth in plies" type="range" min="1" max="24" value={maxDepth} onChange={(event) => changeDepth(Number(event.target.value))}/><span>{maxDepth} plies</span></label>
            <label className="report-tree-check"><input type="checkbox" checked={showLowConfidence} onChange={(event) => { setShowLowConfidence(event.target.checked); setViews((current) => ({ ...current, [color]: null })); }}/> Show below-minimum lines <ReportHelpTrigger label="Why low-confidence lines are hidden"/></label>
            <button className="button button-outline" type="button" aria-pressed={tableView} onClick={() => setTableView((value) => !value)}>{tableView ? 'Radial view' : 'Table view'}</button>
            {!tableView && <div className="report-tree-zoom" aria-label="Tree zoom controls"><ReportHelpTrigger label="How to pan and zoom the tree"/><button className="button button-outline" type="button" aria-label="Zoom in" onClick={() => adjustZoom(1.2)}>+</button><button className="button button-outline" type="button" aria-label="Zoom out" onClick={() => adjustZoom(1 / 1.2)}>−</button><button className="button button-outline" type="button" onClick={resetFit}>Reset (fit)</button></div>}
          </div>
          <div className={'report-tree-view-layout' + (selected ? ' has-selection' : '')}>
          <div className="report-tree-card folder-card">
            {tableView ? tableNodes.length ? <div className="report-tree-table-wrap" role="tree" aria-label={color + ' position tree'}>{renderTreeRows()}</div> : <p>No positions meet the sample and depth filters.</p> : <svg ref={svgRef} className="report-radial-svg" viewBox={'0 0 ' + layout.width + ' ' + layout.height} role="group" aria-label={color + ' radial opening tree'} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)} onPointerLeave={() => setDrag(null)} onWheel={(event) => { event.preventDefault(); adjustZoom(event.deltaY < 0 ? 1.08 : 1 / 1.08); }}>
              <g transform={'translate(' + transform.x + ' ' + transform.y + ') translate(' + layout.center + ' ' + layout.center + ') scale(' + transform.scale + ') translate(' + -layout.center + ' ' + -layout.center + ')'}>
                {layout.rings.map((ring) => <g key={ring.depth} className="report-tree-ring-group"><circle cx={layout.center} cy={layout.center} r={ring.radius} className="report-tree-ring"><title>{'Ply ' + ring.depth}</title></circle><text x={layout.center + 4} y={layout.center - ring.radius + 10} className="report-tree-ring-label">{ring.depth}</text></g>)}
                <text x={layout.center} y={layout.center + 4} textAnchor="middle" className="report-tree-root-label" role="button" tabIndex="0" data-tree-node={layout.root.id} aria-label="Start position. Use arrow down to explore opening moves." aria-pressed={selectedId === layout.root.id} onClick={() => setSelectedId(null)} onKeyDown={selectRootByKeyboard}>Start</text>
                {layout.nodes.filter((node) => node.parentId === layout.root.id).map((node) => <line key={'root:' + node.id} x1={layout.center} y1={layout.center} x2={node.x} y2={node.y} className={'report-tree-link' + (pathIds.has(node.id) ? ' is-path' : '') + (pathIds.size && !pathIds.has(node.id) ? ' is-dimmed' : '')} strokeWidth={1 + 5 * Math.sqrt(node.games / maxLinkGames)} aria-hidden="true"/>)}
                {layout.links.map((link) => <line key={link.id} x1={link.source.x} y1={link.source.y} x2={link.target.x} y2={link.target.y} className={'report-tree-link' + (pathIds.has(link.source.id) && pathIds.has(link.target.id) ? ' is-path' : '') + (pathIds.size && !(pathIds.has(link.source.id) && pathIds.has(link.target.id)) ? ' is-dimmed' : '')} strokeWidth={1 + 5 * Math.sqrt(link.games / maxLinkGames)} aria-hidden="true"><title>{link.move}</title></line>)}
                {layout.nodes.map((node) => {
                  const isLeak = leaks.some((leak) => leak.examples && leak.examples.some((example) => example.row && (example.row.positionKey === node.positionKey || example.row.fenBefore && example.row.fenBefore.split(' ').slice(0, 4).join(' ') === node.positionKey)));
                  const isHighlighted = highlightedPositionKeys.includes(node.positionKey);
                  const hasLesson = lessons.some((lesson) => lesson.normalizedFen === normalizeLessonFen(node.positionKey));
                  const isLabelled = node.tail || node.games >= labelThreshold;
                  const pathActive = pathIds.has(node.id);
                  const openLabel = !node.tail && node.openingChanged && node.openingName;
                  const classes = (node.lowConfidence ? ' is-low-confidence' : '') + (isLeak ? ' is-leak' : '') + (isHighlighted ? ' is-highlighted' : '') + (selectedId === node.id ? ' is-selected' : '');
                  return <g key={node.id} className={'report-tree-node' + (pathIds.size && !pathActive ? ' is-dimmed' : '')} role="button" tabIndex={node.depth ? 0 : -1} data-tree-node={node.id} aria-label={describe(node) + (hasLesson ? ', saved lesson' : '')} aria-pressed={selectedId === node.id} onMouseEnter={() => setHoveredId(node.id)} onMouseLeave={() => setHoveredId(null)} onFocus={() => setHoveredId(node.id)} onBlur={(event) => { if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) setHoveredId(null); }} onClick={() => node.tail ? toggleTail(node.id) : setSelectedId(node.id)} onKeyDown={(event) => selectByKeyboard(event, node)}>
                    <circle cx={node.x} cy={node.y} r={node.radius} fill={node.fill} className={classes}/>
                    {isLabelled && <text x={node.x + node.radius + 4} y={node.y - 3} className="report-tree-label">{node.tail ? node.label : node.label || node.name}</text>}
                    {openLabel && <text x={node.x + node.radius + 4} y={node.y + 10} className="report-tree-opening-label">{(node.eco ? node.eco + ' · ' : '') + node.openingName}</text>}
                    {isLeak && <circle cx={node.x + node.radius * .72} cy={node.y - node.radius * .72} r="4" className="report-tree-leak-marker" aria-hidden="true"/>}
                    {hasLesson && <text x={node.x - node.radius} y={node.y - node.radius - 3} className="report-tree-note-marker" aria-label="Saved lesson">▣</text>}
                    <title>{describe(node) + (node.openingName ? '; ' + node.openingName : '')}</title>
                  </g>;
                })}
              </g>
            </svg>}
            <details className="report-tree-legend" open>
              <summary>How to read the tree</summary>
              <div className="report-tree-legend-content"><ReportHelpTrigger label="How to interpret tree rings and dots"/><span><i className="report-legend-worse"/> Worse than expected</span><span><i className="report-legend-neutral"/> About as expected</span><span><i className="report-legend-better"/> Better than expected</span><span><i className="report-legend-size"/> Dot size = games</span><span><i className="report-legend-leak"/> Thick outline/dot = leak</span><span><i className="report-legend-low"/> Dashed outline = low confidence</span></div>
            </details>
          </div>
          {selected && <aside className="folder-card report-tree-detail" aria-label="Selected position details">
            <div className="report-tree-detail-heading"><div><p className="meta-line">{selected.eco || 'PLY ' + (selected.depthPly ?? selected.depth)}</p><h4>{selected.openingName || selected.label || selected.name}</h4></div><button className="button button-outline" type="button" onClick={() => setSelectedId(null)} aria-label="Close position details">Close</button></div>
            <p className="report-tree-sequence" aria-label="Moves leading to this position">{selected.lineBefore && selected.lineBefore.length ? selected.lineBefore.join(' ') : 'Start position'}</p>
            <ReadOnlyFen fen={selected.positionKey + ' 0 1'} color={color} lastMoveUci={selected.lastMoveUci}/>
            <p>You reached this position in {selected.games} {selected.games === 1 ? 'game' : 'games'} and won {selected.wins}. After your moves here, your winning chances changed by {Number.isFinite(selected.averageWinProbabilityChange) ? (selected.averageWinProbabilityChange >= 0 ? '+' : '') + Math.round(selected.averageWinProbabilityChange * 100) + ' points' : 'an unknown amount'} on average. {Math.round((selected.mistakeRate || 0) * 100)}% of your moves from here were flagged.</p>
            <p>Results: {selected.wins} wins, {selected.draws} draws and {selected.losses} losses.</p>
            {touchingLeaks.length > 0 && <div><strong>Related leaks</strong><ul>{touchingLeaks.map((leak) => <li key={leak.id}>{leak.title}</li>)}</ul></div>}
            <div><strong>Example games</strong><ul>{selected.exampleGameIds && selected.exampleGameIds.map((gameId) => <li key={gameId}><a href="#report-games-title" onClick={(event) => { event.preventDefault(); onShowGames && onShowGames(gameId); document.getElementById('report-games-title')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); }}>Show game {gameId}</a></li>)}</ul></div>
            {(onSaveLesson || openLesson) && <button className="button button-outline" type="button" onClick={() => (onSaveLesson || openLesson)({ kind: 'position', color, normalizedFen: selected.positionKey, openingName: selected.openingName, openingKey: selected.positionKey, tags: ['opening-position'], sourceGameIds: selected.exampleGameIds || [] })}>Save as lesson</button>}
            <button className="button button-outline" type="button" disabled aria-describedby="report-training-next">Train this line</button><p id="report-training-next" className="small-meta">Training arrives in the next update.</p>
          </aside>}
          </div>
        </>}
  </section>;
}
