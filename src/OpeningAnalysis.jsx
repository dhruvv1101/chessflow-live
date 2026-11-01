export default function OpeningAnalysis({ moves }) {
  const opening = moves.slice(0, 20);
  return <section className="folder-card opening-analysis" aria-labelledby="opening-analysis-title">
    <div className="folder-head"><div className="icon-box icon-peach" aria-hidden="true">O</div><div><p className="meta-line">OPENING PHASE</p><h2 id="opening-analysis-title">Opening notes</h2></div></div>
    <p className="opening-line">{opening.length ? opening.map((move) => move.san).join(' ') : 'No moves yet.'}</p>
    <p className="small-meta">No opening database is configured, so named openings, deviations and traps are not asserted. Move evaluations remain available in the review.</p>
  </section>;
}
