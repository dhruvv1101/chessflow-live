import { useEffect, useState } from 'react';
import { loadPracticeResults, loadTrainingGames, summarizeTraining } from './training.js';

export default function MistakeStatistics({ reviewedCount }) {
  const [stats, setStats] = useState(() => summarizeTraining(loadTrainingGames(), loadPracticeResults()));
  useEffect(() => {
    const update = () => setStats(summarizeTraining(loadTrainingGames(), loadPracticeResults()));
    update();
    globalThis.addEventListener?.('chessflow:training-updated', update);
    return () => globalThis.removeEventListener?.('chessflow:training-updated', update);
  }, [reviewedCount]);
  return <section className="folder-card training-card" aria-labelledby="training-title">
    <div className="folder-head"><div className="icon-box icon-lime" aria-hidden="true">↗</div><div><p className="meta-line">LOCAL REVIEW HISTORY</p><h2 id="training-title">My Chess Improvement</h2></div></div>
    {stats.games ? <>
      <div className="training-stat-grid">
        <div><strong>{stats.games}</strong><span>games reviewed</span></div>
        <div><strong>{stats.blundersPerGame}</strong><span>blunders / game</span></div>
        <div><strong>{stats.inaccuraciesPerGame}</strong><span>inaccuracies / game</span></div>
        <div><strong>{stats.averageLossCp} cp</strong><span>average loss / ply</span></div>
        <div><strong>{stats.mistakesPracticed}</strong><span>Mistakes practiced</span></div>
        <div><strong>{stats.foundBestMoveFirstTryPercent}%</strong><span>Found best move first try</span></div>
      </div>
      <details><summary>Patterns from your reviews</summary><ul><li>Opening-phase mistakes: {stats.openingMistakes}</li><li>Middlegame mistakes: {stats.middlegameMistakes}</li><li>Endgame mistakes: {stats.endgameMistakes}</li><li>Missed winning chances (engine score ≥ +2 pawns): {stats.missedWinningOpportunities}</li><li>Moves with a verified check/capture clue: {stats.verifiedTacticalClues}</li></ul><p className="small-meta">Last 7 days: {stats.recentMistakes} inaccurate, mistaken or blundered plies. No official Elo rating is calculated.</p></details>
      <p className="small-meta">Saved in this browser only. Tactical motifs beyond checks and captures, time-management and piece-coordination weaknesses are not yet classified.</p>
    </> : <p className="small-meta">Review a finished PGN to start tracking mistakes here. Your analysis stays in this browser.</p>}
  </section>;
}
