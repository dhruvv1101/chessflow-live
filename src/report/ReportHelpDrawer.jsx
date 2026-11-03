import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useEntitlement } from './useEntitlement.js';

const HelpContext = createContext(null);

export function buildReportHelpItems(limits) {
  const { reportInsights, lossThresholds } = limits;
  const lostBefore = Math.round(limits.lostAdvantage.minimumBeforeWinProbability * 100);
  const lostAfter = Math.round(limits.lostAdvantage.maximumAfterWinProbability * 100);
  return [
    ['Ply', 'One move by one side. 12 plies means 6 moves by each side.'],
    ['Visible depth', 'How many plies of each line are shown. Lower it to focus on the opening.'],
    ['Show below-minimum lines', `Lines seen in fewer than ${reportInsights.minimumSampleGames} games are hidden because one game is not a pattern. Turn this on to see them.`],
    ['Rings', 'Each ring is one more ply from the start position in the center.'],
    ['Dots and lines', 'A dot is a position reached in your games. A line is the move that led there.'],
    ['Dot size', 'Larger dots mean more of your games reached that position.'],
    ['Dot color', 'Color shows how your winning chances changed on average after your moves from this position. Worse than expected means you tend to lose ground here.'],
    ['W / D / L', 'The wins, draws and losses among games that passed through this position.'],
    ['Average win-probability change', 'The average change, in percentage points, in your chance to win after your moves from here. A negative number means you lost ground.'],
    ['Mistake rate', 'The share of your moves from here that were an inaccuracy or worse.'],
    ['Confidence', `Low confidence means fewer than ${reportInsights.lowConfidenceGames} games. Good sample means ${reportInsights.goodSampleGames} games or more.`],
    ['Eval', 'Stockfish’s score from your side in pawns. +1.0 is about one pawn ahead.'],
    ['Inaccuracy / Mistake / Blunder', `A move that drops your winning chances by at least ${Math.round(lossThresholds.inaccuracy * 100)} / ${Math.round(lossThresholds.mistake * 100)} / ${Math.round(lossThresholds.blunder * 100)} percentage points.`],
    ['Lost advantage', `You had at least ${lostBefore}% winning chances and dropped below ${lostAfter}%.`],
    ['Missed chance', 'Your opponent just made a mistake and your reply did not take advantage of it.'],
    ['Time labels', 'Instant move, long think, low clock and normal pace are estimates from the clock and are marked likely.'],
    ['Analysis depth', `How deep Stockfish searched (${limits.analysisDepth} in the free version). Deeper analysis is usually more accurate but slower.`],
    ['Leak totals and ranking', 'Leak cards rank by score (occurrences multiplied by total winning-chance points lost). One move can appear in more than one leak category, so points lost across leaks overlap and are not additive.'],
  ];
}

export function ReportHelpTrigger({ label = 'More information' }) {
  const context = useContext(HelpContext);
  if (!context) return null;
  return <button className="button button-outline report-help-trigger" type="button" aria-label={label} title={label} onClick={context.open}>i</button>;
}

export function ReportHelpProvider({ children }) {
  const { limits } = useEntitlement();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const closeRef = useRef(null);
  const openDrawer = () => { triggerRef.current = document.activeElement; setOpen(true); };
  const closeDrawer = () => { setOpen(false); requestAnimationFrame(() => triggerRef.current?.focus?.()); };

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  const items = buildReportHelpItems(limits);
  return <HelpContext.Provider value={{ open: openDrawer }}>
    {children}
    {open && <div className="report-help-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDrawer(); }}>
      <section className="folder-card report-help-drawer" role="dialog" aria-modal="true" aria-labelledby="report-help-title" onKeyDown={(event) => {
        if (event.key === 'Escape') { closeDrawer(); return; }
        if (event.key !== 'Tab') return;
        const focusable = [...event.currentTarget.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((element) => !element.disabled);
        if (!focusable.length) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}>
        <div className="report-help-heading"><div><p className="meta-line">REPORT GUIDE</p><h2 id="report-help-title">How to read this report</h2></div><button ref={closeRef} className="button button-outline" type="button" onClick={closeDrawer}>Close</button></div>
        <div className="report-help-items">{items.map(([title, description]) => <article key={title}><h3>{title}</h3><p>{description}</p></article>)}</div>
      </section>
    </div>}
  </HelpContext.Provider>;
}
