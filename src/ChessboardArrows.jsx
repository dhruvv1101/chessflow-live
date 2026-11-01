function center(square, whiteOrientation) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  const column = whiteOrientation ? file : 7 - file;
  const row = whiteOrientation ? 8 - rank : rank - 1;
  return { x: column * 100 + 50, y: row * 100 + 50 };
}

export default function ChessboardArrows({ arrows = [], whiteOrientation }) {
  const visible = arrows.filter((arrow) => /^[a-h][1-8]$/.test(arrow.from) && /^[a-h][1-8]$/.test(arrow.to)).slice(0, 3);
  if (!visible.length) return null;
  return <svg className="board-arrow-overlay" viewBox="0 0 800 800" aria-hidden="true">
    <defs><marker id="board-arrow-head" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M0 0 8 4 0 8Z" fill="context-stroke"/></marker></defs>
    {visible.map((arrow, index) => {
      const from = center(arrow.from, whiteOrientation);
      const to = center(arrow.to, whiteOrientation);
      return <g key={`${arrow.from}-${arrow.to}-${index}`} className={`board-arrow ${arrow.kind || 'best'}`}>
        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} markerEnd="url(#board-arrow-head)"/>
        <circle cx={to.x} cy={to.y} r="20"/>
      </g>;
    })}
  </svg>;
}
