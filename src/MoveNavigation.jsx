export default function MoveNavigation({ moves, currentPly, playing, onGoTo, onTogglePlay }) {
  const totalMoves = Math.ceil(moves.length / 2);
  const currentMove = Math.ceil(currentPly / 2);
  const positionLabel = `Move ${currentMove} / ${totalMoves}`;
  return <section className="move-navigation" aria-label="Game navigation">
    <div className="navigation-controls">
      <button className="button button-outline" aria-label="Go to first move" title="First position" onClick={() => onGoTo(0)} disabled={!moves.length || currentPly === 0}>⏮</button>
      <button className="button button-outline" aria-label="Previous move" title="Previous ply" onClick={() => onGoTo(currentPly - 1)} disabled={currentPly === 0}>←</button>
      <button className="button button-yellow replay-button" aria-label={playing ? 'Pause replay' : 'Play replay'} onClick={onTogglePlay} disabled={!moves.length}>{playing ? 'Ⅱ' : '▶'}</button>
      <button className="button button-outline" aria-label="Next move" title="Next ply" onClick={() => onGoTo(currentPly + 1)} disabled={currentPly >= moves.length}>→</button>
      <button className="button button-outline" aria-label="Go to last move" title="Last position" onClick={() => onGoTo(moves.length)} disabled={!moves.length || currentPly >= moves.length}>⏭</button>
    </div>
    <output className="move-position" aria-live="polite">{positionLabel}<small>Position {currentPly} of {moves.length}</small></output>
  </section>;
}
