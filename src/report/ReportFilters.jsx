import { availableTimeClasses } from './filters.js';

export default function ReportFilters({ games, shownCount, value, onChange, loading = false, error = '' }) {
  const update = (key, next) => onChange((current) => ({ ...current, [key]: next }));
  const timeClasses = availableTimeClasses(games);
  const active = Object.values(value).some((entry) => entry && entry !== 'all');
  return <section className="folder-card report-filter-card" aria-labelledby="report-filters-title">
    <div className="section-heading report-section-heading"><div><p className="meta-line">NARROW YOUR REPORT</p><h2 id="report-filters-title">Filters</h2></div>
      {active && <button className="button button-outline" type="button" onClick={() => onChange({ side: 'all', timeClass: 'all', from: '', to: '' })}>Clear filters</button>}
    </div>
    <div className="report-filter-grid">
      <fieldset className="report-filter-fieldset"><legend>Side played</legend><div className="report-filter-options" role="group" aria-label="Filter games by your color">
        {['all', 'white', 'black'].map((side) => <button className={`button ${value.side === side ? 'button-yellow' : 'button-outline'}`} type="button" key={side} aria-pressed={value.side === side} onClick={() => update('side', side)}>{side === 'all' ? 'Both' : side[0].toUpperCase() + side.slice(1)}</button>)}
      </div></fieldset>
      <label className="setting-select">Time class<select value={value.timeClass} onChange={(event) => update('timeClass', event.target.value)}>
        <option value="all">All time classes</option>{timeClasses.map((timeClass) => <option value={timeClass} key={timeClass}>{timeClass[0].toUpperCase() + timeClass.slice(1)}</option>)}
      </select></label>
      <label className="setting-select">From date<input type="date" value={value.from} onChange={(event) => update('from', event.target.value)}/></label>
      <label className="setting-select">To date<input type="date" value={value.to} min={value.from || undefined} onChange={(event) => update('to', event.target.value)}/></label>
    </div>
    <p className="small-meta">Date filters apply only to your imported games; they do not change the 25-game free-tier limit.</p>
    {loading ? <p className="small-meta" role="status" aria-live="polite">Loading your saved games and filter options…</p>
      : error ? <p className="small-meta" role="alert">Filters could not load saved games: {error}</p>
        : <p className="small-meta" role="status" aria-live="polite">Showing {shownCount} of {games.length} imported {games.length === 1 ? 'game' : 'games'}.</p>}
  </section>;
}
