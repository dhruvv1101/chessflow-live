const badgeClass = (label = '') => `history-${label.toLowerCase().replaceAll(' ', '-')}`;

export default function MoveHistory({ moves, currentPly, onSelect, perspectiveColor = null }) {
  if (!moves.length) return <p className="empty-copy">Your opening move starts here.</p>;
  return <ol className="move-history" aria-label="Move history">
    {moves.map((move) => <li key={move.ply}>
      <span className="history-number">{move.number || Math.ceil(move.ply / 2)}{move.color === 'w' ? '.' : '…'}</span>
      <button type="button" className={`history-move ${currentPly === move.ply ? 'is-current' : ''} ${move.label ? badgeClass(move.label) : ''}`}
        aria-current={currentPly === move.ply ? 'step' : undefined}
        aria-label={`${perspectiveColor ? move.color === perspectiveColor ? 'You' : 'Opponent' : move.color === 'w' ? 'White' : 'Black'} move ${move.number || Math.ceil(move.ply / 2)}: ${move.san}${move.label ? `, ${move.label}` : ''}`}
        onClick={() => onSelect(move.ply)}>{move.san}{move.label && <span className="history-mark" aria-hidden="true">{move.label === 'Blunder' ? '!' : move.label === 'Mistake' ? '?!' : move.label === 'Inaccuracy' ? '?' : '★'}</span>}</button>
    </li>)}
  </ol>;
}
