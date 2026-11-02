import { useEffect, useState } from 'react';
import { classifyGame } from './openings.js';

export default function OpeningAnalysis({ moves, startFen }) {
  const [state, setState] = useState({ status: 'loading', opening: null, error: '' });
  useEffect(() => {
    let active = true;
    setState({ status: 'loading', opening: null, error: '' });
    classifyGame(moves, { startFen }).then((opening) => { if (active) setState({ status: 'ready', opening, error: '' }); })
      .catch((error) => { if (active) setState({ status: 'error', opening: null, error: error.message }); });
    return () => { active = false; };
  }, [moves, startFen]);
  const opening = state.opening;
  const bookPlies = opening?.bookPly || 0;
  return <section className="folder-card opening-analysis" aria-labelledby="opening-analysis-title">
    <div className="folder-head"><div className="icon-box icon-peach" aria-hidden="true">O</div><div><p className="meta-line">OPENING PHASE</p><h2 id="opening-analysis-title">Opening notes</h2></div></div>
    {state.status === 'loading' && <p className="small-meta" role="status">Loading opening data…</p>}
    {state.status === 'error' && <p className="small-meta" role="status">Opening names are unavailable right now.</p>}
    {state.status === 'ready' && (opening ? <>
      <p className="opening-line"><strong>{opening.eco} {opening.name}</strong></p>
      <ol className="opening-move-line" aria-label="Opening line">
        {moves.map((move, index) => <li key={move.ply} className={index < bookPlies ? 'is-book-move' : 'is-out-of-book'}><span>{move.number || Math.ceil(move.ply / 2)}{move.color === 'w' ? '.' : '…'}</span>{move.san}</li>)}
      </ol>
      {opening.firstOutOfBookPly ? <p className="small-meta">Left known theory at move {moves[opening.firstOutOfBookPly - 1]?.number || Math.ceil(opening.firstOutOfBookPly / 2)} ({opening.firstOutOfBookMove}).</p> : <p className="small-meta">All played moves remain in this named line.</p>}
      <p className="small-meta opening-theory-note" title="A move leaving a known line is not automatically a bad move.">Leaving theory does not mean a move was bad.</p>
    </> : <p className="small-meta">No named opening found for this game.</p>)}
  </section>;
}
