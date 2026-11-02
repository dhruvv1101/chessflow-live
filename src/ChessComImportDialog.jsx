import { useEffect, useMemo, useRef, useState } from 'react';
import { ChessComClient, enrichChessComGame, filterChessComGames, parseChessComUsername } from './chesscom.js';

function savedUsername() { try { return localStorage.getItem('chessflow.chesscom.username') || ''; } catch { return ''; } }
function archiveParts(url) { const match = String(url).match(/\/(\d{4})\/(\d{2})$/); return match ? { year: Number(match[1]), month: Number(match[2]) } : null; }
function resultLabel(result) { return result === 'win' ? 'Win' : result === 'loss' ? 'Loss' : result === 'draw' ? 'Draw' : 'Unknown'; }
function dateLabel(date) { return date && Number.isFinite(date.getTime()) ? `${date.toLocaleDateString()} · ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Date unavailable'; }
function safeGameUrl(value) { try { const url = new URL(String(value)); return url.protocol === 'https:' && ['chess.com', 'www.chess.com'].includes(url.hostname) ? url.href : null; } catch { return null; } }

export default function ChessComImportDialog({ onClose, onAnalyze, onSave }) {
  const dialogRef = useRef(null);
  const [usernameInput, setUsernameInput] = useState(savedUsername);
  const [username, setUsername] = useState('');
  const [archives, setArchives] = useState([]);
  const [archiveIndex, setArchiveIndex] = useState(0);
  const [games, setGames] = useState([]);
  const [skippedVariants, setSkippedVariants] = useState(0);
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState({ timeClass: '', color: '', result: '', month: '', opponent: '' });
  const [page, setPage] = useState(0);
  const controllerRef = useRef(null);
  const client = useMemo(() => new ChessComClient(), []);
  const visible = filterChessComGames(games, filters);
  const pageGames = visible.slice(page * 20, page * 20 + 20);

  useEffect(() => { if (dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal(); }, []);

  const loadUsername = async () => {
    let normalized;
    try { normalized = parseChessComUsername(usernameInput); }
    catch (cause) { setError(cause.message); return; }
    controllerRef.current?.abort(); controllerRef.current = new AbortController();
    setBusy(true); setError(''); setGames([]); setArchives([]); setArchiveIndex(0); setSkippedVariants(0); setPage(0); setUsername(normalized);
    try {
      try { localStorage.setItem('chessflow.chesscom.username', normalized); } catch { /* remembering usernames is optional */ }
      const monthUrls = await client.getArchives(normalized, { signal: controllerRef.current.signal });
      if (!monthUrls.length) { setArchives([]); return; }
      setArchives(monthUrls);
      const newest = archiveParts(monthUrls[0]);
      if (!newest) throw new Error('Chess.com returned malformed archive data.');
      const result = await client.getMonth(normalized, newest.year, newest.month, { signal: controllerRef.current.signal });
      setGames(result.games.map((game) => enrichChessComGame(game, normalized)));
      setSkippedVariants(result.skippedVariants);
      setArchiveIndex(1);
    } catch (cause) { if (cause.name !== 'AbortError') setError(cause.message || 'Could not load public Chess.com games. Please try again later.'); }
    finally { setBusy(false); }
  };

  const loadOlder = async () => {
    const archive = archives[archiveIndex];
    const month = archiveParts(archive);
    if (!month || busy) return;
    controllerRef.current?.abort(); controllerRef.current = new AbortController();
    setBusy(true); setError('');
    try {
      const result = await client.getMonth(username, month.year, month.month, { signal: controllerRef.current.signal });
      setGames((current) => [...current, ...result.games.map((game) => enrichChessComGame(game, username))]);
      setSkippedVariants((current) => current + result.skippedVariants);
      setArchiveIndex((current) => current + 1);
      setFilters((current) => ({ ...current, month: '' }));
    } catch (cause) { if (cause.name !== 'AbortError') setError(cause.message || 'Could not load public Chess.com games. Please try again later.'); }
    finally { setBusy(false); }
  };

  const forgetUsername = () => {
    try { localStorage.removeItem('chessflow.chesscom.username'); } catch { /* local storage can be disabled */ }
    setUsernameInput('');
  };
  const updateFilter = (key, value) => { setPage(0); setFilters((current) => ({ ...current, [key]: value })); };

  return <dialog ref={dialogRef} className="chesscom-dialog" aria-labelledby="chesscom-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <section className="folder-card chesscom-modal-card">
      <header className="chesscom-modal-head"><div><p className="meta-line">PUBLIC GAME ARCHIVE</p><h2 id="chesscom-title">Import from Chess.com</h2></div><button className="button button-outline" onClick={onClose} aria-label="Close Chess.com import">Close</button></header>
      <p className="small-meta">Chess.com doesn't offer a login for other sites, so we read your public games with your username. This doesn't prove who you are.</p>
      <div className="chesscom-username-row"><label className="setting-select">Chess.com username or profile URL<input autoFocus value={usernameInput} onChange={(event) => setUsernameInput(event.target.value)} placeholder="username or chess.com/member/username" autoComplete="off"/></label><button className="button button-yellow" disabled={busy || !usernameInput.trim()} onClick={loadUsername}>{busy ? 'Loading…' : 'Load games'}</button><button className="button button-outline" onClick={forgetUsername}>Forget username</button>{busy && <button className="button button-outline" onClick={() => controllerRef.current?.abort()}>Cancel request</button>}</div>
      {error && <p className="error-copy" role="alert">{error}</p>}
      {username && !busy && !games.length && !error && <p className="small-meta">No public standard-chess games found in this account.</p>}
      {games.length > 0 && <>
        <p className="small-meta" role="status">Showing {games.length} standard games for {username}.{skippedVariants > 0 ? ` Skipped ${skippedVariants} variant game${skippedVariants === 1 ? '' : 's'}.` : ''}</p>
        <div className="chesscom-filters">
          <label>Time class<select aria-label="Filter time class" value={filters.timeClass} onChange={(event) => updateFilter('timeClass', event.target.value)}><option value="">All</option>{['bullet', 'blitz', 'rapid', 'daily'].map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Colour<select aria-label="Filter colour" value={filters.color} onChange={(event) => updateFilter('color', event.target.value)}><option value="">All</option><option value="white">White</option><option value="black">Black</option></select></label>
          <label>Result<select aria-label="Filter result" value={filters.result} onChange={(event) => updateFilter('result', event.target.value)}><option value="">All</option><option value="win">Win</option><option value="draw">Draw</option><option value="loss">Loss</option></select></label>
          <label>Month<select aria-label="Filter month" value={filters.month} onChange={(event) => updateFilter('month', event.target.value)}><option value="">All loaded months</option>{[...new Set(games.map((game) => game.archiveMonth))].map((month) => <option key={month}>{month}</option>)}</select></label>
          <label>Opponent<input aria-label="Search opponent" value={filters.opponent} onChange={(event) => updateFilter('opponent', event.target.value)} placeholder="Search name"/></label>
        </div>
        <div className="chesscom-games" aria-label="Chess.com public games">
          {pageGames.map((rawGame, index) => {
            const game = rawGame.color ? rawGame : enrichChessComGame(rawGame, username);
            const key = `${game.url || game.end_time || 'game'}-${index}`;
            return <article className="chesscom-game" key={key}>
            <div className="chesscom-game-main"><strong>{dateLabel(game.date)}</strong><span>{String(game.time_class || 'unknown')} · {game.color || 'unknown colour'} · {resultLabel(game.myResult)}</span><span>vs {game.opponentName} · {game.color ? game[game.color]?.rating ?? '—' : '—'} / {game.color ? game[game.color === 'white' ? 'black' : 'white']?.rating ?? '—' : '—'}</span><span>{game.moveCount} moves{game.accuracy != null ? ` · Your accuracy ${game.accuracy}%` : ''}{game.opponentAccuracy != null ? ` · Opponent accuracy ${game.opponentAccuracy}%` : ''}{game.eco ? ` · ${game.eco}${game.opening ? ` ${game.opening}` : ''}` : ''}</span></div>
              <div className="chesscom-game-actions">{safeGameUrl(game.url) && <a className="button button-outline" href={safeGameUrl(game.url)} target="_blank" rel="noopener noreferrer">View on Chess.com</a>}<button className="button button-yellow" disabled={!game.pgn} onClick={() => onAnalyze(game.pgn, { username, color: game.color })}>Analyze</button><button className="button button-outline" disabled={!game.pgn || busy} onClick={async () => { setBusy(true); setError(''); setSaveMessage(''); try { setSaveMessage(await onSave(game) || 'Game saved.'); } catch { setError('Could not save this game. Please try again.'); } finally { setBusy(false); } }}>Save to my games</button></div>
            </article>;
          })}
          {!pageGames.length && <p className="small-meta">No games match these filters.</p>}
        </div>
        <div className="chesscom-paging"><button className="button button-outline" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Previous page</button><span>Page {page + 1} of {Math.max(1, Math.ceil(visible.length / 20))}</span><button className="button button-outline" disabled={(page + 1) * 20 >= visible.length} onClick={() => setPage((current) => current + 1)}>Next page</button></div>
        {saveMessage && <p className="small-meta" role="status">{saveMessage}</p>}
        <div className="chesscom-load-row"><button className="button button-outline" disabled={busy || archiveIndex >= archives.length} onClick={loadOlder}>Load older games</button></div>
      </>}
      <p className="small-meta chesscom-attribution">Games from Chess.com's public data. Not affiliated with Chess.com.</p>
      <p className="small-meta">Your username is sent to Chess.com via this site's server function. No games are stored on the server.</p>
    </section>
  </dialog>;
}
