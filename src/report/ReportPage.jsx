import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './report.css';
import './report-workspace.css';
import { reportChessComClient } from './client.js';
import { useEntitlement } from './useEntitlement.js';
import { clearReportGames, loadReportGames, saveReportGames } from './storage.js';
import { clearAnalysisCache } from './analysisCache.js';
import AnalysisProgress from './AnalysisProgress.jsx';
import ReportInsights from './ReportInsights.jsx';
import ReportFilters from './ReportFilters.jsx';
import ReportGames from './ReportGames.jsx';
import { filterReportData } from './filters.js';
import { loadOpeningDatabase } from '../openings.js';
import { attachOpeningContexts, buildOpeningTree, buildOpeningSummary } from './tree.js';
import { detectLeaks } from './leaks.js';
import { summarizeFirstBigMistakes } from './firstBigMistake.js';

function countLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatImportSummary(result, limits) {
  const { dropped } = result;
  const empty = result.games.length === 0 && result.gamesFetched === 0 ? ' No games were listed in the fetched archives.' : '';
  return `Imported ${result.games.length} of up to ${limits.maxGames} most recent standard games. Archive months: ${result.archiveMonthsFound} found, ${result.archiveMonthsFetched} fetched, ${result.archiveMonthsNotFetched} not fetched after reaching the game limit. ${result.gamesFetched} games checked. Dropped by reason: ${countLabel(dropped.variants, 'variant')}, ${countLabel(dropped.invalidPgn, 'invalid PGN')}, ${countLabel(dropped.noMoves, 'game with no moves', 'games with no moves')}, ${countLabel(dropped.shortGames || 0, 'short game', 'short games')} with fewer than ${limits.minimumUserMoves} moves by you, ${countLabel(dropped.missingMetadata, 'game missing details', 'games missing details')}, ${countLabel(dropped.duplicates, 'duplicate game')}, ${dropped.overLimit} beyond the ${limits.maxGames}-game limit.${empty}`;
}

export default function ReportPage() {
  const { limits } = useEntitlement();
  const [username, setUsername] = useState('');
  const [games, setGames] = useState([]);
  const [analysisRows, setAnalysisRows] = useState([]);
  const [analysisStatus, setAnalysisStatus] = useState('idle');
  const [openingDatabase, setOpeningDatabase] = useState(null);
  const [openingStatus, setOpeningStatus] = useState('idle');
  const [filters, setFilters] = useState({ side: 'all', timeClass: 'all', from: '', to: '' });
  const [importStatusOpen, setImportStatusOpen] = useState(true);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [message, setMessage] = useState('');
  const [importReasons, setImportReasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedGameIds, setSelectedGameIds] = useState(null);
  const controllerRef = useRef(null);

  const handleAnalysisComplete = useCallback((rows) => { setAnalysisRows(rows); setImportStatusOpen(false); }, []);
  const handleAnalysisStatus = useCallback((state) => setAnalysisStatus(state.status), []);

  useEffect(() => {
    let active = true;
    loadReportGames().then((stored) => { if (active) setGames(stored); })
      .catch(() => { if (active) { setError('Could not open local game-report storage in this browser.'); setStorageError('Could not open local game-report storage in this browser.'); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controllerRef.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!analysisRows.length || !games.length) return undefined;
    let active = true;
    setOpeningStatus('loading');
    loadOpeningDatabase().then((database) => {
      if (active) { setOpeningDatabase(database); setOpeningStatus('ready'); }
    }).catch(() => { if (active) setOpeningStatus('error'); });
    return () => { active = false; };
  }, [analysisRows, games]);

  const filtered = useMemo(() => filterReportData(games, analysisRows, filters), [games, analysisRows, filters]);

  const insights = useMemo(() => {
    if (!filtered.rows.length) return null;
    const database = openingDatabase || {};
    const contextualRows = attachOpeningContexts(filtered.games, filtered.rows, database);
    const tree = buildOpeningTree(filtered.games, contextualRows, { database, ...limits.reportInsights, minimumUserMoves: limits.minimumUserMoves });
    return {
      tree,
      openingRows: buildOpeningSummary(tree),
      leaks: detectLeaks(filtered.games, contextualRows, { tree, topN: limits.topLeaks, ...limits.reportInsights, minimumUserMoves: limits.minimumUserMoves }),
      firstMistakes: summarizeFirstBigMistakes(filtered.games, contextualRows, { ...limits.reportInsights, minimumUserMoves: limits.minimumUserMoves }),
      analysisRows: contextualRows,
    };
  }, [filtered, limits, openingDatabase]);

  const importGames = async (event) => {
    event.preventDefault();
    if (busy) return;
    setError(''); setMessage(''); setImportReasons([]); setProgress(null);
    setAnalysisRows([]);
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    try {
      const result = await reportChessComClient.importRecentGames(username, {
        ...limits,
        signal: controller.signal,
        onProgress: setProgress,
      });
      const stored = await saveReportGames(result.games, limits);
      setGames(stored);
      setMessage(formatImportSummary(result, limits));
      setImportReasons(result.skippedGameReasons || []);
    } catch (failure) {
      setError(failure?.name === 'AbortError' ? 'Import cancelled.' : failure?.message || 'Could not import Chess.com games.');
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setBusy(false);
    }
  };

  const cancelImport = () => controllerRef.current?.abort();

  const deleteImportedData = async () => {
    setError(''); setMessage('');
    try { await Promise.all([clearReportGames(), clearAnalysisCache()]); setGames([]); setAnalysisRows([]); setSelectedGameIds(null); setMessage('Imported game data deleted from this browser.'); }
    catch { setError('Could not delete imported game data from this browser.'); }
  };

  return <main className="app-shell report-page">
    <div className="background-shapes" aria-hidden="true"><span className="shape-circle"/><span className="shape-slab"/><span className="shape-block"/></div>
    <header className="topbar report-topbar">
      <a className="brand" href="#top" aria-label="ChessFlow Live home"><img className="brand-mark" src="/assets/chessflow-logo.png" alt=""/><span>CHESSFLOW <b>LIVE</b></span></a>
      <a className="button button-outline" href="#top">Back to ChessFlow Live</a>
    </header>

    <section className="hero report-hero" aria-labelledby="report-title">
      <p className="eyebrow"><span className="eyebrow-square"/> YOUR GAMES. YOUR DATA.</p>
      <h1 id="report-title"><span>Game Report</span><span>Leak Trainer</span></h1>
      <div className="hero-foot"><p>Import your public games for a private, on-device report and training plan.</p><p className="hero-status">Free tier: up to {limits.maxGames} most recent standard games.</p></div>
    </section>

    <details className="folder-card report-import-card" open={importStatusOpen} onToggle={(event) => setImportStatusOpen(event.currentTarget.open)}>
      <summary className="report-import-summary"><span>Import and analysis status</span><span className="report-import-state">{loading ? 'Loading saved games' : busy ? 'Import in progress' : error ? 'Needs attention' : analysisRows.length ? 'Analysis complete' : games.length ? 'Analysis in progress' : 'Ready'}</span></summary>
      <div className="report-import-content">
      <div className="folder-tab tab-purple" aria-hidden="true"/>
      <div className="folder-head"><div className="icon-box icon-purple" aria-hidden="true">↧</div><div><p className="meta-line">PUBLIC CHESS.COM GAMES</p><h2 id="report-import-title">Import games</h2></div></div>
      <p className="small-meta report-description">Enter a Chess.com username. It is sent to Chess.com through this site's server function. No password or Chess.com login is used.</p>
      <form className="report-import-form" onSubmit={importGames}>
        <label className="setting-select" htmlFor="report-username">Chess.com username
          <input id="report-username" className="report-username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="off" maxLength={25} minLength={3} required aria-describedby="report-limits" placeholder="Your username" disabled={busy}/>
        </label>
        <button className="button button-yellow" type="submit" disabled={busy}><span aria-hidden="true">↧</span>{busy ? 'Importing…' : 'Import games'}</button>
        {busy && <button className="button button-outline" type="button" onClick={cancelImport}>Cancel</button>}
      </form>
      <p id="report-limits" className="small-meta">Only standard chess games, the {limits.maxGames} most recent, are kept.</p>
      {progress && <div className="report-progress" role="status" aria-live="polite"><p>{progress.message}</p><progress aria-label="Import progress" max={Math.max(1, progress.total)} value={progress.completed}/></div>}
      <AnalysisProgress games={games} onAnalysisComplete={handleAnalysisComplete} onStatusChange={handleAnalysisStatus}/>
      {error && <p className="report-message report-error" role="alert">{error}</p>}
      {message && <p className="report-message" role="status" aria-live="polite">{message}</p>}
      {importReasons.length > 0 && <details className="report-message">
        <summary>Why some games were skipped ({importReasons.length} details)</summary>
        <ul>{importReasons.map((entry, index) => <li key={`${entry.url}-${index}`}>{entry.url || `Game ${index + 1}`}: {entry.reason}</li>)}</ul>
      </details>}
      </div>
    </details>

    <ReportFilters games={games} shownCount={filtered.games.length} value={filters} onChange={setFilters} loading={loading} error={storageError}/>
    <ReportInsights
      leaks={insights?.leaks || []} openingRows={insights?.openingRows || []}
      tree={insights?.tree}
      firstMistakes={insights?.firstMistakes || { gamesLost: 0, gamesWithFirstMistake: 0, entries: [] }}
      openingStatus={!filtered.games.length ? 'empty' : openingStatus === 'error' ? 'error' : openingStatus === 'ready' ? 'ready' : 'loading'}
      leaksStatus={!filtered.games.length ? 'empty' : analysisStatus === 'error' ? 'error' : !filtered.rows.length ? 'loading' : 'ready'}
      onFilterGames={setSelectedGameIds}
    />

    <ReportGames games={filtered.games} totalGames={games.length} rows={insights?.analysisRows || []} analysisStatus={analysisStatus} loadingStorage={loading} storageError={storageError} busy={busy} selectedGameIds={selectedGameIds} onClearFilter={() => setSelectedGameIds(null)} onDelete={deleteImportedData}/>

    <footer className="site-footer report-footer"><span><img className="footer-mark" src="/assets/chessflow-logo.png" alt=""/> ChessFlow Live</span><span>Not affiliated with Chess.com.</span></footer>
  </main>;
}
