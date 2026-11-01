import React from 'react';
import { Chessboard } from 'react-chessboard';
import { DIFFICULTIES } from './config.js';
import { formatEvaluation, pieceName, promotionPiece, uciLineToSan, uciToSan } from './game.js';
import EvaluationGraph from './EvaluationGraph.jsx';
import PanelErrorBoundary from './PanelErrorBoundary.jsx';
import SettingsPanel from './SettingsPanel.jsx';

const difficulties = ['Easy', 'Medium', 'Hard', 'Max'];
const sides = [['w', 'White'], ['b', 'Black'], ['random', 'Random']];
const sideName = (side) => side === 'w' ? 'White' : 'Black';

export default function DashboardLayout({
  chess, fen, human, sideChoice, difficulty, config, engineState, engineError, thinking,
  hints, promotion, notice, resigned, pgn, setPgn, reviewRows, reviewState, reviewProgress,
  status, sideToMove, options, moveListRef, moves, startGame, setDifficulty, requestHint,
  undo, setResigned, setNotice, importFinishedPgn, promote, setPromotion, onBoardKeyDown,
  settings, onSettingsChange, resetSettings, clearSavedGame, dragState,
  onBoardPointerDown, onBoardPointerMove, onBoardPointerUp, onBoardPointerCancel, onBoardMouseLeave,
  mode, localSession, savedLocalGame, startLocalGame, resumeLocalGame, hintLoading, engineProgress, onCancelHint, onResignLocal, onOfferDraw, localOutcome,
  bestHintMove, whiteOrientation,
  engineServerStatus,
  onLoadCloudGame,
}) {
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [localNames, setLocalNames] = React.useState({ whiteName: 'White', blackName: 'Black' });
  const [flipMotion, setFlipMotion] = React.useState(false);
  React.useEffect(() => {
    if (mode !== 'local' || localSession?.options.orientation !== 'auto') return undefined;
    setFlipMotion(true);
    const timer = window.setTimeout(() => setFlipMotion(false), 220);
    return () => window.clearTimeout(timer);
  }, [fen, mode, localSession?.options.orientation]);
  const activeLine = hints[sideToMove]?.lines?.[0];
  const gameOver = ['checkmate', 'stalemate', 'draw'].includes(status.kind) || resigned;
  const startNewGame = () => mode === 'local' ? startLocalGame(localSession.options) : startGame();
  const score = activeLine?.cp ?? (activeLine?.mate != null ? Math.sign(activeLine.mate) * 1200 : 0);
  const whiteShare = Math.max(8, Math.min(92, 50 + score / 30));

  return <main className="app-shell">
    <div className="background-shapes" aria-hidden="true"><span className="shape-circle"/><span className="shape-slab"/><span className="shape-block"/></div>
    <header className="topbar">
      <a className="brand" href="#top" aria-label="ChessFlow Live home"><span className="brand-mark" aria-hidden="true">CF</span><span>CHESSFLOW <b>LIVE</b></span></a>
      <div className="top-actions"><span className={`engine-pill ${engineState}`}><span className="engine-status-icon" aria-hidden="true">{engineState === 'ready' ? '✓' : engineState === 'loading' ? '…' : '!'}</span><span>{engineLabel(engineState)}</span></span>{mode === 'local' && <button className="button button-outline ai-switch-button" aria-label="Switch to AI mode" onClick={() => startGame('w')}>AI mode</button>}<button className="button button-yellow top-new-game" onClick={startNewGame}><ActionIcon name="new"/>New game</button></div>
      <button className="button button-outline settings-button" aria-label="Settings" onClick={() => setSettingsOpen(true)}><ActionIcon name="settings"/><span>Settings</span></button>
    </header>
    <span className={`server-status-chip ${engineServerStatus.state}`} role="status" aria-label={`Engine server: ${engineServerStatus.state === 'online' ? 'Online' : engineServerStatus.state === 'offline' ? 'Offline' : 'Using browser engine'}`}><i aria-hidden="true"/>{engineServerStatus.state === 'online' ? 'Online' : engineServerStatus.state === 'offline' ? 'Offline' : 'Using browser engine'}</span>
    {settingsOpen && <SettingsPanel settings={settings} onChange={onSettingsChange} onReset={resetSettings} onClearSavedGame={clearSavedGame} onClose={() => setSettingsOpen(false)} engineServerStatus={engineServerStatus} fen={fen} pgn={pgn} onLoadCloudGame={onLoadCloudGame}/>}

    {mode !== 'local' && <><section className="hero" id="top">
      <p className="eyebrow"><span className="eyebrow-square"/> YOUR BOARD. YOUR MOVE.</p>
      <h1><span>Play now.</span><span>Think deeper.</span></h1>
      <div className="hero-foot"><p>A proper game of chess, with a strong engine waiting on the other side.</p><p className="hero-status" aria-live="polite">{notice}</p></div>
    </section>

    <section className="start-section" aria-labelledby="start-title">
      <div className="section-heading"><div><p className="meta-line">SET UP YOUR NEXT MATCH</p><h2 id="start-title">Start a game</h2></div><span className="step-mark">01 / 03</span></div>
      <div className="home-grid">
        {mode !== 'local' && <>
        <section className="folder-card choice-card">
          <div className="folder-tab tab-pink" aria-hidden="true"/>
          <div className="folder-head"><div className="icon-box icon-pink" aria-hidden="true"><span className="side-glyph">♔</span></div><div><p className="meta-line">PICK YOUR SIDE</p><h3>How do you play?</h3></div></div>
          <div className="option-row side-options" aria-label="Choose your side">
            {sides.map(([value, label]) => <button className={`option-button ${sideChoice === value ? 'is-selected' : ''}`} key={value} onClick={() => startGame(value)} aria-pressed={sideChoice === value}><span className="option-glyph" aria-hidden="true">{value === 'w' ? '♙' : value === 'b' ? '♟' : '↻'}</span><span>{label}</span></button>)}
          </div>
        </section>
        <section className="folder-card difficulty-card">
          <div className="folder-tab tab-peach" aria-hidden="true"/>
          <div className="folder-head"><div className="icon-box icon-peach" aria-hidden="true"><span className="level-glyph">LV</span></div><div><p className="meta-line">CHOOSE YOUR CHALLENGE</p><h3>Difficulty</h3></div></div>
          <div className="option-row difficulty-options" aria-label="Choose difficulty">
            {difficulties.map((name) => <button className={`option-button difficulty-option ${difficulty === name ? 'is-selected' : ''}`} key={name} onClick={() => setDifficulty(name)} aria-pressed={difficulty === name}><span>{name}</span><small>Lvl {DIFFICULTIES[name].skill}</small></button>)}
          </div>
          <p className="small-meta">{config.movetime} ms thinking time · Skill {config.skill} / 20</p>
        </section>
        </>}
        <section className="folder-card local-setup-card">
          <div className="folder-tab tab-green" aria-hidden="true"/><div className="folder-head"><div className="icon-box icon-green" aria-hidden="true">2P</div><div><p className="meta-line">PASS AND PLAY</p><h3>Two players</h3></div></div>
          <div className="local-name-fields"><label>White name<input aria-label="White name" maxLength={16} value={localNames.whiteName} onChange={(event) => setLocalNames((current) => ({ ...current, whiteName: event.target.value }))}/></label><label>Black name<input aria-label="Black name" maxLength={16} value={localNames.blackName} onChange={(event) => setLocalNames((current) => ({ ...current, blackName: event.target.value }))}/></label></div>
          <label className="setting-toggle"><input type="checkbox" checked={settings.localHintsAllowed} onChange={(event) => onSettingsChange({ localHintsAllowed: event.target.checked })}/><span>Hints allowed</span></label>
          <label className="setting-select">Orientation<select aria-label="Two-player setup orientation" value={settings.localOrientation} onChange={(event) => onSettingsChange({ localOrientation: event.target.value })}><option value="fixed">Fixed</option><option value="auto">Auto-flip after each move</option></select></label>
          <label className="setting-select">Clock<select aria-label="Two-player clock"><option value="none">None</option><option value="5+0">5+0</option><option value="10+0">10+0</option><option value="15+10">15+10</option></select></label>
          <button className="button button-yellow" onClick={(event) => { const card = event.currentTarget.closest('.local-setup-card'); startLocalGame({ whiteName: localNames.whiteName, blackName: localNames.blackName, hintsAllowed: settings.localHintsAllowed, orientation: settings.localOrientation, clock: card.querySelector('[aria-label="Two-player clock"]').value }); }}>Start two-player game</button>
          {savedLocalGame && <button className="button button-outline" onClick={resumeLocalGame}>Resume game</button>}
        </section>
      </div>
      <section className="pgn-bar" aria-labelledby="pgn-title">
        <div className="pgn-prompt"><div className="icon-box icon-yellow" aria-hidden="true"><span>↗</span></div><div><p className="meta-line">ALREADY PLAYED?</p><h3 id="pgn-title">Paste PGN to review</h3></div></div>
        <label className="sr-only" htmlFor="pgn-input">Paste a finished game PGN</label>
        <textarea id="pgn-input" value={pgn} onChange={(event) => setPgn(event.target.value)} placeholder={'[Result "1-0"]   1. e4 e5 …'} rows="2" />
        <button className="button button-yellow review-button" onClick={importFinishedPgn} disabled={!pgn.trim() || thinking}><ActionIcon name="review"/>Review</button>
      </section>
      {reviewProgress && <p className="review-progress" role="status">{reviewProgress}</p>}
      {reviewRows.length > 0 && <div className="review-results">
        <PanelErrorBoundary panel="Evaluation graph"><EvaluationGraph rows={reviewRows}/></PanelErrorBoundary>
        <section className="folder-card review-table-card"><div className="folder-tab tab-yellow" aria-hidden="true"/><div className="folder-head"><div className="icon-box icon-yellow" aria-hidden="true">#</div><div><p className="meta-line">MOVE BY MOVE</p><h2>Review notes</h2></div></div><p className="small-meta">{reviewState === 'done' ? 'Short before/after searches; evaluations stay from White’s view.' : reviewProgress}</p><div className="review-table-wrap"><table className="review-table"><thead><tr><th>#</th><th>Move</th><th>Eval</th><th>Review</th></tr></thead><tbody>{reviewRows.map((row) => <tr key={row.number}><td>{row.number}</td><td>{sideName(row.color)} · {row.san}</td><td>{row.eval}</td><td><ReviewBadge label={row.label}/></td></tr>)}</tbody></table></div>{reviewState === 'failed' && <p className="error-copy" role="alert">Review stopped early. {notice}</p>}</section>
      </div>}
    </section></>}

    <div className="game-layout">
      <section className="board-column" aria-label="Play area">
        <div className="board-heading"><div><p className="meta-line">{mode === 'local' ? 'PASS AND PLAY' : 'YOUR GAME'}</p><h2>Game board</h2></div><span className="turn-chip"><span className="turn-indicator" aria-hidden="true">{sideToMove === 'w' ? 'W' : 'B'}</span>{mode === 'local' ? `${sideToMove === 'w' ? localSession?.options.whiteName : localSession?.options.blackName} to move (${sideName(sideToMove)})` : `${sideName(sideToMove)} to move`}</span></div>
        <div className="folder-card board-card"><div className="folder-tab tab-purple" aria-hidden="true"/><PanelErrorBoundary panel="Chess board"><div className={`board-wrap ${flipMotion ? 'local-flip-motion' : ''}`} tabIndex={0} role="application" aria-label="Chess board. Use arrow keys to choose a square, Enter or Space to select or move, and Escape to cancel. You can also click or drag pieces." onKeyDown={onBoardKeyDown} onPointerDown={onBoardPointerDown} onPointerMove={onBoardPointerMove} onPointerUp={onBoardPointerUp} onPointerCancel={onBoardPointerCancel} onLostPointerCapture={onBoardPointerCancel} onMouseLeave={onBoardMouseLeave}>
          <Chessboard options={options}/>
          {bestHintMove && <div className="hint-overlay-layer" aria-hidden="true">{[bestHintMove.slice(0, 2), bestHintMove.slice(2, 4)].map((square) => <span key={square} className="hint-square-highlight" data-hint-square={square} style={hintSquarePosition(square, whiteOrientation)}/>)}</div>}
          {dragState && options.pieces[dragState.pieceType] && <div className="piece-drag-overlay" style={{ left: dragState.x, top: dragState.y, width: dragState.size, height: dragState.size }} aria-hidden="true">{React.createElement(options.pieces[dragState.pieceType])}</div>}
          {promotion && <div className="promotion-shade" role="dialog" aria-modal="true" aria-labelledby="promotion-title"><div className="promotion-card"><p className="meta-line">FINAL STEP</p><h2 id="promotion-title">Promote pawn</h2><p>Choose a piece for your promotion.</p><div className="promotion-options">{['q','r','b','n'].map((piece) => <button className="promotion-choice" key={piece} aria-label={`Promote to ${pieceName(piece)}`} onClick={() => promote(piece)}>{promotionPiece(promotion.color, piece)}</button>)}</div><button className="button button-outline cancel-promotion" onClick={() => setPromotion(null)}>Cancel</button></div></div>}
        </div></PanelErrorBoundary></div>
        <section className="folder-card evaluation-card"><div className="folder-tab tab-yellow" aria-hidden="true"/><div className="evaluation-label"><div><p className="meta-line">POSITION BALANCE</p><h3>Evaluation</h3></div><strong>{activeLine ? formatEvaluation(activeLine) : 'Even'}</strong></div><div className="evaluation-track" role="img" aria-label={`Evaluation: ${formatEvaluation(activeLine || { cp: 0 })}, White advantage ${Math.round(whiteShare)} percent`}><span className="white-share" style={{width:`${whiteShare}%`}}/><span className="black-share" style={{width:`${100-whiteShare}%`}}/></div><div className="evaluation-captions"><span>WHITE</span><span>BLACK</span></div>{mode === 'local' && localSession?.options.clock !== 'none' && <p className="clock-readout" role="timer"><span>{localSession.options.whiteName}: {formatClock(localSession.clocks.w)}</span><span>{localSession.options.blackName}: {formatClock(localSession.clocks.b)}</span></p>}</section>
        <div className={`game-message-card ${status.kind}`} role="status"><span className="message-icon" aria-hidden="true">{status.kind === 'playing' ? '•' : status.kind === 'check' ? '!' : '✓'}</span><span>{resigned ? localOutcome === 'draw' ? 'Draw agreed.' : localOutcome === 'flag-draw' ? 'Time expired; draw by insufficient material.' : localOutcome === 'flag' ? 'Time expired.' : 'Player resigned.' : statusText(status)}</span></div>
      </section>

      <div className="side-grid">
        {!(mode === 'local' && !localSession?.options.hintsAllowed) && <PanelErrorBoundary panel="Best move analysis"><section className="folder-card analysis-panel"><div className="folder-tab tab-lime" aria-hidden="true"/><div className="folder-head"><div className="icon-box icon-lime" aria-hidden="true">A+</div><div><p className="meta-line">STOCKFISH READOUT</p><h2>Best move analysis</h2></div></div><p className="small-meta">{mode === 'local' ? 'Hint scores from the side-to-move perspective; graph remains White perspective.' : 'Centipawn scores from White’s perspective.'}</p>
          {['w','b'].map((color) => <section className="analysis-side" key={color}><div className="analysis-side-title"><h3>{sideName(color)}</h3><span className="small-meta">{color === sideToMove ? 'TO MOVE' : 'LAST LINE'}</span></div>{hints[color] ? <><div className="table-scroll"><table className="analysis-table"><thead><tr><th>Line</th><th>Move</th><th>Evaluation</th></tr></thead><tbody>{hints[color].lines.map((line) => <tr key={line.rank}><td>{line.rank === 1 ? 'Best move' : `Alternative ${line.rank - 1}`}</td><td className="move-cell">{line.move ? uciToSan(hints[color].fen, line.move) : '—'}</td><td>{mode === 'local' ? formatSideEvaluation({ cp: line.sideCp, mate: line.sideMate }) : formatEvaluation(line)}</td></tr>)}</tbody></table></div><div className="future-box"><strong>Future Moves</strong><span>{hints[color].lines[0]?.pvSan?.join(' ') || uciLineToSan(hints[color].fen, hints[color].lines[0]?.pv || []).join(' ') || 'No line available'}</span></div>{hints[color].engineInfo && <p className="engine-info" aria-label="Engine info">{hints[color].engineInfo.source === 'Server engine' ? `Server engine: ${hints[color].engineInfo.name}, depth ${hints[color].engineInfo.depth}` : `Using browser engine: ${hints[color].engineInfo.name} (${hints[color].engineInfo.build}), depth ${hints[color].engineInfo.depth}`}; {hints[color].engineInfo.threads} thread(s); Hash {hints[color].engineInfo.hashMb} MB; {hints[color].engineInfo.nodes} nodes; {hints[color].engineInfo.time} ms{hints[color].engineInfo.fallbackReason ? `; fallback: ${hints[color].engineInfo.fallbackReason}` : ''}</p>}</> : <div className="empty-analysis">{color === sideToMove ? 'Ask for a hint to reveal the leading lines.' : 'Your last line will appear here.'}</div>}</section>)}
        </section></PanelErrorBoundary>}

        <section className="folder-card moves-panel"><div className="folder-tab tab-peach" aria-hidden="true"/><div className="folder-head"><div className="icon-box icon-peach" aria-hidden="true">M</div><div><p className="meta-line">GAME RECORD</p><h2>Moves <span className="count-badge">{chess.history().length} ply</span></h2></div></div>{mode === 'local' && <p className="small-meta">Hints used: {localSession?.options.whiteName} {localSession?.hintCounts.w || 0} · {localSession?.options.blackName} {localSession?.hintCounts.b || 0}</p>}<div className="move-list" ref={moveListRef} aria-live="polite">{moves.length ? moves.map((move) => <div className="move-row" key={move}>{move}</div>) : <p className="empty-copy">Your opening move starts here.</p>}</div></section>

        <section className="folder-card runtime-panel"><div className="folder-tab tab-yellow" aria-hidden="true"/><div className="folder-head"><div className="icon-box icon-yellow" aria-hidden="true"><span className={`status-glyph ${engineState}`}>{engineState === 'ready' ? '✓' : engineState === 'loading' ? '…' : '!'}</span></div><div><p className="meta-line">RUNTIME STATUS</p><h2>Engine status</h2></div></div><dl><div><dt>Mode</dt><dd>{mode === 'local' ? 'Two players' : 'Web'}</dd></div><div><dt>Engine</dt><dd>{mode === 'local' ? 'Stockfish · hints only' : 'Stockfish WASM'}</dd></div><div><dt>Ready</dt><dd><span className={`status-word ${engineState}`}>{engineState === 'ready' ? 'YES' : engineState === 'loading' ? 'LOADING' : 'NO'}</span></dd></div>{mode !== 'local' && <><div><dt>Skill level</dt><dd>{config.skill} / 20</dd></div><div><dt>Thinking time</dt><dd>{config.movetime} ms</dd></div></>}</dl>{engineError && <p className="error-copy" role="alert">{engineError}</p>}</section>

        <section className="folder-card action-card"><div className="folder-tab tab-pink" aria-hidden="true"/><div className="folder-head"><div className="icon-box icon-pink" aria-hidden="true">↗</div><div><p className="meta-line">YOUR MOVE</p><h2>Game controls</h2></div></div>{mode === 'local' && !localSession?.options.hintsAllowed ? <p className="small-meta">Hints are disabled for this game.</p> : <><button className="button button-lime hint-button" onClick={requestHint} disabled={thinking || gameOver}><ActionIcon name="hint"/>{mode === 'local' ? `Hint for ${sideToMove === 'w' ? localSession?.options.whiteName : localSession?.options.blackName}` : thinking ? 'Thinking…' : 'Get a hint'}</button>{hintLoading && <button className="button button-outline" onClick={onCancelHint}>Cancel hint search</button>}{engineState === 'loading' && <label className="engine-progress-label">Loading engine assets <progress max="100" value={engineProgress}>{engineProgress}%</progress></label>}</>}<div className="action-grid"><button className="button button-outline" onClick={undo} disabled={!chess.history().length}><ActionIcon name="undo"/>Undo {mode === 'local' ? 'one ply' : ''}</button>{mode === 'local' && <button className="button button-outline" onClick={onOfferDraw}>Offer draw</button>}<button className="button button-outline" onClick={() => { if (mode === 'local') onResignLocal(); else { setResigned(true); setNotice('You resigned. Start a new game whenever you are ready.'); } }} disabled={gameOver}><ActionIcon name="resign"/>Resign</button><button className="button button-yellow action-new" onClick={startNewGame}><ActionIcon name="new"/>New game</button></div><p className="small-meta">Moves are legal only. Use click, drag, or keyboard controls.</p></section>

      </div>
    </div>
    <footer className="site-footer"><span><span className="footer-mark" aria-hidden="true">CF</span> ChessFlow Live</span><span>Stockfish stays on your device</span></footer>
  </main>;
}

function ActionIcon({ name }) {
  const paths = {
    new: <path d="M12 5v14M5 12h14"/>,
    review: <><path d="M5 19 19 5M7 5h12v12"/></>,
    hint: <><path d="M9 18h6M10 22h4M8 14c-1.6-1.2-2.5-3-2.5-5a6.5 6.5 0 1 1 13 0c0 2-1 3.8-2.5 5-.7.6-1 1.2-1 2h-6c0-.8-.3-1.4-1-2Z"/></>,
    undo: <><path d="M9 14 4 9l5-5"/><path d="M4 9h9a6 6 0 0 1 0 12h-2"/></>,
    resign: <><path d="M6 21V4m0 1h12l-2.5 4L18 13H6"/></>,
    settings: <><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="m19.4 15 .1.1 1.2 1-1.4 2.4-1.5-.6a7.8 7.8 0 0 1-1.7 1l-.3 1.6h-2.8l-.3-1.6a7.8 7.8 0 0 1-1.7-1l-1.5.6-1.4-2.4 1.2-1a7.5 7.5 0 0 1 0-2l-1.2-1 1.4-2.4 1.5.6a7.8 7.8 0 0 1 1.7-1l.3-1.6h2.8l.3 1.6a7.8 7.8 0 0 1 1.7 1l1.5-.6 1.4 2.4-1.2 1a7.5 7.5 0 0 1 0 2Z"/></>,
  };
  return <svg className="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function ReviewBadge({ label }) {
  const style = label === 'Blunder' ? 'badge-pink' : label === 'Mistake' ? 'badge-peach' : label === 'Inaccuracy' ? 'badge-yellow' : 'badge-none';
  return <span className={`review-badge ${style}`}><span aria-hidden="true">{label === 'Blunder' ? '!' : label === 'Mistake' ? '▲' : label === 'Inaccuracy' ? '~' : '✓'}</span> {label}</span>;
}

function statusText(status) {
  if (status.kind === 'checkmate') return `Checkmate — ${status.winner} wins.`;
  if (status.kind === 'stalemate') return 'Stalemate — drawn game.';
  if (status.kind === 'draw') return `${status.reason} — drawn game.`;
  if (status.kind === 'check') return `${sideName(status.side)} is in check.`;
  return 'Game in progress.';
}

function formatSideEvaluation(score) {
  if (score.mate != null) return score.mate > 0 ? `Mate in ${score.mate}` : `Losing mate in ${Math.abs(score.mate)}`;
  if (score.cp == null) return '—';
  return `${score.cp > 0 ? '+' : ''}${(score.cp / 100).toFixed(2)}`;
}

function hintSquarePosition(square, whiteOrientation) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  const column = whiteOrientation ? file : 7 - file;
  const row = whiteOrientation ? 8 - rank : rank - 1;
  return { left: `${column * 12.5}%`, top: `${row * 12.5}%` };
}

function formatClock(milliseconds) {
  const seconds = Math.ceil(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function engineLabel(state) {
  return ({ idle: 'Engine ready on first move', loading: 'Loading engine', ready: 'Stockfish ready', failed: 'Engine failed', timeout: 'Engine timeout' })[state];
}

