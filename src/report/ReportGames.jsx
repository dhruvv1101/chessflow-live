import { useMemo, useState } from 'react';
import EvalGraph from './EvalGraph.jsx';
import { filterGamesByIds, resultFromUserSide } from './gameReportData.js';

function formatDate(timestamp) {
  return timestamp ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(timestamp)) : 'Date unavailable';
}

function gameOpening(game, rows) {
  const contextual = rows.filter((row) => row.gameKey === game.url && row.openingContext?.name).at(-1)?.openingContext;
  return game.opening || contextual?.name || null;
}

export default function ReportGames({ games, totalGames = games.length, rows, analysisStatus, loadingStorage, storageError, busy, selectedGameIds, onClearFilter, onDelete }) {
  const [selectedUrl, setSelectedUrl] = useState(null);
  const visibleGames = useMemo(() => filterGamesByIds(games, selectedGameIds), [games, selectedGameIds]);

  return <section className="report-games-section" aria-labelledby="report-games-title">
    <div className="section-heading"><div><p className="meta-line">SAVED ON THIS DEVICE</p><h2 id="report-games-title">Games</h2></div><div className="report-games-actions">
      {selectedGameIds?.length > 0 && <button className="button button-outline" type="button" onClick={onClearFilter}>Show all games</button>}
      <button className="button button-outline" type="button" onClick={onDelete} disabled={busy || !totalGames}>Delete my imported data</button>
    </div>
    </div>
    {loadingStorage ? <p className="folder-card report-empty" role="status">Loading local games…</p>
      : storageError ? <p className="folder-card report-empty" role="alert">{storageError}</p>
        : !totalGames ? <div className="folder-card report-empty"><p className="meta-line">NO IMPORTED GAMES</p><h3>Your report starts here</h3><p className="small-meta">Import recent public games above. Games are saved in this browser; the proxy does not retain game records.</p></div>
          : !games.length || !visibleGames.length ? <p className="folder-card report-empty" role="status">No games match the current filters or selection.</p>
          : <>
          {analysisStatus === 'running' && <p className="folder-card report-empty" role="status">Games are ready while move analysis continues.</p>}
          {analysisStatus === 'error' && <p className="folder-card report-empty" role="alert">Move analysis is unavailable. Imported games remain saved.</p>}
          <p className="small-meta report-games-count">Showing {visibleGames.length} {visibleGames.length === 1 ? 'game' : 'games'}{selectedGameIds?.length ? ' from the selected tree position or leak' : ''}.</p>
          <div className="report-game-list">
            {visibleGames.map((game, index) => {
              const opponent = game.userColor === 'white' ? game.headers.Black : game.headers.White;
              const opening = gameOpening(game, rows);
              const isSelected = selectedUrl === game.url;
              const panelId = `report-game-analysis-${index}`;
              return <article className={`folder-card report-game-card${isSelected ? ' is-selected' : ''}`} id={`report-game-${index}`} key={game.url}>
                <p className="meta-line">{formatDate(game.endTime)} · {String(game.timeClass || 'unknown').toUpperCase()}</p>
                <h3>{game.headers.White || 'White'} vs {game.headers.Black || 'Black'}</h3>
                <p className="small-meta">Opponent: {opponent || 'Unknown'} · You played {game.userColor || 'unknown side'} · Result: {resultFromUserSide(game)} · Opening: {opening ? `${game.eco ? `${game.eco} · ` : ''}${opening}` : 'No named opening'} · {game.moves.length} plies</p>
                <button className="button button-outline" type="button" aria-expanded={isSelected} aria-controls={panelId} onClick={() => setSelectedUrl(isSelected ? null : game.url)}>{isSelected ? 'Close game analysis' : 'Analyze game'}</button>
                {isSelected && <div id={panelId} className="report-game-analysis-panel" aria-label={`Analysis for ${game.headers.White || 'White'} versus ${game.headers.Black || 'Black'}`}>
                  {rows.some((row) => row.gameKey === game.url) ? <EvalGraph game={game} rows={rows}/> : <p className="small-meta" role="status">Move analysis is not ready for this game yet.</p>}
                </div>}
              </article>;
            })}
          </div>
        </>}
  </section>;
}
