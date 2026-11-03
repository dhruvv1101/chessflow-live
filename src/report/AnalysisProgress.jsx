import { useCallback, useEffect, useRef, useState } from 'react';
import { createReportAnalysisSession } from './analysisJob.js';
import { subscribeLiveGameActive } from './analysisCoordinator.js';
import AnalysisSummary from './AnalysisSummary.jsx';

function progressState(progress) {
  return { completed: progress?.completed || 0, total: progress?.total || 0 };
}

export default function AnalysisProgress({ games }) {
  const sessionRef = useRef(null);
  const gamesRef = useRef(games);
  const activeRef = useRef(true);
  const [state, setState] = useState({ status: 'idle', completed: 0, total: 0, rows: 0, results: [], error: '' });
  const [liveGameActive, setLiveGameActive] = useState(false);

  gamesRef.current = games;

  const run = useCallback((session, gameList) => {
    setState((current) => ({ ...current, status: 'running', error: '' }));
    session.analyzeGames(gameList, { onProgress: (progress) => {
      if (activeRef.current && sessionRef.current === session) setState((current) => ({ ...current, ...progressState(progress) }));
    } }).then((rows) => {
      if (activeRef.current && sessionRef.current === session) setState((current) => ({ ...current, status: 'complete', rows: rows.length, results: rows, completed: rows.length, total: rows.length }));
    }).catch((error) => {
      if (!activeRef.current || sessionRef.current !== session) return;
      if (error?.name === 'AbortError') setState((current) => ({ ...current, status: 'cancelled' }));
      else setState((current) => ({ ...current, status: 'error', error: error?.message || 'Could not analyze imported games.' }));
    });
  }, []);

  useEffect(() => subscribeLiveGameActive(setLiveGameActive), []);

  useEffect(() => {
    activeRef.current = true;
    if (!games.length) return () => { activeRef.current = false; };
    let session;
    try {
      session = createReportAnalysisSession();
      sessionRef.current = session;
      setState({ status: 'running', completed: 0, total: 0, rows: 0, results: [], error: '' });
      run(session, games);
    } catch (error) {
      setState({ status: 'error', completed: 0, total: 0, rows: 0, results: [], error: error?.message || 'Could not start Stockfish analysis.' });
    }
    return () => {
      activeRef.current = false;
      session?.cancel();
      session?.dispose();
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, [games, run]);

  if (!games.length) return null;
  const cancel = () => sessionRef.current?.cancel();
  const resume = () => {
    const session = sessionRef.current;
    if (!session) return;
    activeRef.current = true;
    run(session, gamesRef.current);
  };
  const isRunning = state.status === 'running';
  const message = state.status === 'error' ? state.error
    : state.status === 'complete' ? `Analysis complete: ${state.rows} of ${state.total} user moves.`
      : state.status === 'cancelled' ? 'Analysis stopped. Resume to continue; completed positions are cached on this device.'
        : liveGameActive ? `Analysis paused while your live game is active. ${state.completed} of ${state.total} user moves checked.`
          : `Analyzing user moves: ${state.completed} of ${state.total}.`;

  return <>
    <div className={`report-progress${state.status === 'error' ? ' report-error' : ''}`} role={state.status === 'error' ? 'alert' : 'status'} aria-live="polite">
      <p>{message}</p>
      {state.status !== 'error' && <progress aria-label="Move analysis progress" max={Math.max(1, state.total)} value={state.completed}/>}
      {isRunning && <button className="button button-outline" type="button" onClick={cancel}>Cancel analysis</button>}
      {state.status === 'cancelled' && <button className="button button-outline" type="button" onClick={resume}>Resume analysis</button>}
    </div>
    {state.status === 'complete' && <AnalysisSummary games={games} rows={state.results}/>}
  </>;
}
