import { useEffect, useRef, useState } from 'react';
import './report.css';
import { reportChessComClient } from './client.js';
import { useEntitlement } from './useEntitlement.js';
import { clearReportGames, loadReportGames, saveReportGames } from './storage.js';

function formatDate(timestamp) {
  return timestamp ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(timestamp)) : 'Date unavailable';
}

export default function ReportPage() {
  const { limits } = useEntitlement();
  const [username, setUsername] = useState('');
  const [games, setGames] = useState([]);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const controllerRef = useRef(null);

  useEffect(() => {
    let active = true;
    loadReportGames().then((stored) => { if (active) setGames(stored); })
      .catch(() => { if (active) setError('Could not open local game-report storage in this browser.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controllerRef.current?.abort(); };
  }, []);

  const importGames = async (event) => {
    event.preventDefault();
    if (busy) return;
    setError(''); setMessage(''); setProgress(null);
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
      setMessage(`Imported ${result.games.length} recent games.${result.skippedVariants ? ` Skipped ${result.skippedVariants} variant games.` : ''}${result.skippedInvalid ? ` Skipped ${result.skippedInvalid} unreadable games.` : ''}`);
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
    try { await clearReportGames(); setGames([]); setMessage('Imported game data deleted from this browser.'); }
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
      <div className="hero-foot"><p>Import your public games for a private, on-device report and training plan.</p><p className="hero-status">Free tier: last {limits.lookbackDays} days · up to {limits.maxGames} games.</p></div>
    </section>

    <section className="folder-card report-import-card" aria-labelledby="report-import-title">
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
      <p id="report-limits" className="small-meta">Only standard chess games from the last {limits.lookbackDays} days are kept, up to {limits.maxGames} games.</p>
      {progress && <div className="report-progress" role="status" aria-live="polite"><p>{progress.message}</p><progress aria-label="Import progress" max={Math.max(1, progress.total)} value={progress.completed}/></div>}
      {error && <p className="report-message report-error" role="alert">{error}</p>}
      {message && <p className="report-message" role="status" aria-live="polite">{message}</p>}
    </section>

    <section className="report-games-section" aria-labelledby="report-games-title">
      <div className="section-heading"><div><p className="meta-line">SAVED ON THIS DEVICE</p><h2 id="report-games-title">Imported games</h2></div><button className="button button-outline" type="button" onClick={deleteImportedData} disabled={busy || !games.length}>Delete my imported data</button></div>
      {loading ? <p className="folder-card report-empty" role="status">Loading local games…</p> : games.length ? <div className="report-game-list">
        {games.map((game) => <article className="folder-card report-game-card" key={game.url}>
          <p className="meta-line">{formatDate(game.endTime)} · {game.timeClass}</p>
          <h3>{game.headers.White || 'White'} vs {game.headers.Black || 'Black'}</h3>
          <p className="small-meta">You played {game.userColor || 'unknown side'} · {game.result}{game.eco ? ` · ${game.eco}${game.opening ? ` ${game.opening}` : ''}` : ''} · {game.moves.length} plies</p>
        </article>)}
      </div> : <div className="folder-card report-empty"><p className="meta-line">NO IMPORTED GAMES</p><h3>Your report starts here</h3><p className="small-meta">Import recent public games above. Games are saved in this browser; the proxy does not retain game records.</p></div>}
    </section>

    <footer className="site-footer report-footer"><span><img className="footer-mark" src="/assets/chessflow-logo.png" alt=""/> ChessFlow Live</span><span>Not affiliated with Chess.com.</span></footer>
  </main>;
}
