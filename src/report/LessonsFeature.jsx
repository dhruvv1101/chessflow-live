import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useEntitlement } from './useEntitlement.js';
import { lessonDraftFromRow, lessonExportPayload, matchLesson, suggestLessons, validateLessonImport } from './lessonData.js';
import { deleteAllLessons, deleteLesson, importLessons, loadLessons, recordLessonHandling, saveLesson, updateLesson } from './lessonStorage.js';
import { formatCount } from './formatting.js';
import { buildPracticePositionFromLesson, requestPracticeFromReport } from './practiceBridge.js';

const LessonsContext = createContext(null);

export function useLessonActions() { return useContext(LessonsContext) || { lessons: [], openLesson: () => {}, lessonMatches: () => [] }; }

export function LessonsProvider({ children }) {
  const { limits } = useEntitlement();
  const [lessons, setLessons] = useState([]);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const firstInput = useRef(null);
  const lessonTriggerRef = useRef(null);
  const refresh = useCallback(async () => setLessons(await loadLessons()), []);

  useEffect(() => { refresh().catch(() => setError('Lessons could not be loaded from this browser.')); }, []);
  useEffect(() => { if (draft) firstInput.current?.focus(); }, [draft]);

  const openLesson = (rowOrDraft, game, extra = {}) => {
    lessonTriggerRef.current = document.activeElement;
    setError(''); setMessage('');
    const next = rowOrDraft?.fenBefore
      ? lessonDraftFromRow(rowOrDraft, game, extra)
      : { kind: 'position', normalizedFen: '', color: 'white', playedMove: '', bestMove: '', openingName: '', tags: [], sourceGameIds: [], winProbabilityBefore: null, winProbabilityAfter: null, opponentRefutationSan: [], whatHappened: '', whyLikely: '', howToImprove: '', whatIWasThinking: '', myNote: '', status: 'active', source: 'saved by me', ...rowOrDraft, ...extra };
    setDraft(next);
  };
  const closeLesson = () => { setDraft(null); requestAnimationFrame(() => lessonTriggerRef.current?.focus?.()); };

  const saveDraft = async (event) => {
    event.preventDefault(); if (!draft || busy) return;
    setBusy(true); setError('');
    try {
      const lesson = { ...draft, tags: Array.isArray(draft.tags) ? draft.tags : String(draft.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean) };
      delete lesson.id;
      await saveLesson(lesson, { maxLessons: limits.maxSavedLessons });
      await refresh(); closeLesson(); setMessage('Lesson saved on this device.');
    } catch (failure) { setError(failure.message || 'Could not save lesson.'); }
    finally { setBusy(false); }
  };

  const lessonMatches = (rows, games) => {
    const matches = [];
    for (const row of rows || []) {
      if (!row.isUserMove) continue;
      const game = games.find((item) => item.url === row.gameKey);
      for (const lesson of lessons) {
        const match = matchLesson(lesson, row, game, { openingKey: row.openingContext ? row.positionKey : null });
        if (match) matches.push({ ...match, lesson, row, game });
      }
    }
    return matches;
  };

  const value = useMemo(() => ({ lessons, openLesson, lessonMatches, refresh }), [lessons]);
  return <LessonsContext.Provider value={value}>
    {children}
    {message && <p className="report-message" role="status" aria-live="polite">{message}</p>}
    {draft && <div className="report-help-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeLesson(); }}>
      <form className="folder-card report-lesson-editor" role="dialog" aria-modal="true" aria-labelledby="report-lesson-editor-title" onSubmit={saveDraft} onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); closeLesson(); return; }
        if (event.key !== 'Tab') return;
        const focusable = [...event.currentTarget.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((element) => !element.disabled);
        if (!focusable.length) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}>
        <div className="report-help-heading"><div><p className="meta-line">LOCAL NOTES</p><h2 id="report-lesson-editor-title">Save as lesson</h2></div><button className="button button-outline" type="button" onClick={closeLesson}>Cancel</button></div>
        {draft.opponentRefutationSan?.length > 0 && <p className="small-meta"><strong>Engine refutation line:</strong> {draft.opponentRefutationSan.join(' ')}</p>}
        <label>What happened<textarea ref={firstInput} value={draft.whatHappened || ''} onChange={(event) => setDraft({ ...draft, whatHappened: event.target.value })}/></label>
        <label>Why might this have happened?<textarea value={draft.whyLikely || ''} onChange={(event) => setDraft({ ...draft, whyLikely: event.target.value })}/></label>
        <label>How to improve<textarea value={draft.howToImprove || ''} onChange={(event) => setDraft({ ...draft, howToImprove: event.target.value })}/></label>
        <label>What was I thinking? (optional)<textarea value={draft.whatIWasThinking || ''} onChange={(event) => setDraft({ ...draft, whatIWasThinking: event.target.value })}/></label>
        <label>My note<textarea value={draft.myNote || ''} onChange={(event) => setDraft({ ...draft, myNote: event.target.value })}/></label>
        {error && <p role="alert" className="report-error">{error}</p>}
        <button className="button button-yellow" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save lesson'}</button>
      </form>
    </div>}
  </LessonsContext.Provider>;
}

function safeDownloadLessons(lessons) {
  const blob = new Blob([JSON.stringify(lessonExportPayload(lessons), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'chessflow-lessons.json'; anchor.click(); URL.revokeObjectURL(url);
}

export function LessonsSection({ games = [], rows = [], leaks = [], analysisStatus = 'idle' }) {
  const { limits } = useEntitlement();
  const context = useLessonActions();
  const { lessons, openLesson } = context;
  const [kind, setKind] = useState('all'); const [tag, setTag] = useState('all'); const [status, setStatus] = useState('all');
  const [confirmDelete, setConfirmDelete] = useState(false); const [error, setError] = useState(''); const fileRef = useRef(null);
  const [notice, setNotice] = useState('');
  const handledRef = useRef(new Set());
  const suggestions = useMemo(() => suggestLessons(games, rows, { leaks }), [games, rows, leaks]);
  const matches = useMemo(() => context.lessonMatches(rows, games), [context, rows, games]);
  const tags = [...new Set(lessons.flatMap((lesson) => lesson.tags || []))].sort();
  const filtered = lessons.filter((lesson) => (kind === 'all' || lesson.kind === kind) && (tag === 'all' || lesson.tags?.includes(tag)) && (status === 'all' || lesson.status === status));

  useEffect(() => {
    let alive = true;
    (async () => {
      let handledAny = false;
      for (const match of matches) {
        const key = `${match.lessonId}:${match.gameId}:${match.ply}`;
        if (match.handledBetter && alive && !handledRef.current.has(key)) {
          handledRef.current.add(key);
          try { await recordLessonHandling(match.lessonId, `${match.gameId}:${match.ply}`); } catch { /* local progress is best effort */ }
          handledAny = true;
        }
      }
      if (alive && handledAny) await context.refresh?.();
    })();
    return () => { alive = false; };
  }, [matches]);

  const mutate = async (action) => { setError(''); try { await action(); await context.refresh?.(); } catch (failure) { setError(failure.message || 'Could not update lessons.'); } };
  const importFile = async (file) => {
    if (!file) return;
    try {
      if (file.size > 256 * 1024) throw new Error('Lesson files must be 256 KB or smaller.');
      const payload = JSON.parse(await file.text());
      const validated = validateLessonImport(payload, limits.maxSavedLessons);
      await importLessons(validated, { maxLessons: limits.maxSavedLessons }); await context.refresh?.(); setError(''); setNotice(`${validated.length} lessons imported on this device.`);
    } catch (failure) { setError(failure.message || 'Could not import lessons.'); }
    finally { if (fileRef.current) fileRef.current.value = ''; }
  };

  return <section className="report-lessons-section" aria-labelledby="report-lessons-title">
    <div className="section-heading"><div><p className="meta-line">PRIVATE TO THIS BROWSER</p><h2 id="report-lessons-title">Notes &amp; Lessons</h2></div><div className="report-lessons-actions">
      <button className="button button-outline" type="button" onClick={() => safeDownloadLessons(lessons)} disabled={!lessons.length}>Export lessons</button>
      <button className="button button-outline" type="button" onClick={() => fileRef.current?.click()}>Import lessons</button>
      <input ref={fileRef} className="report-hidden-input" type="file" accept="application/json,.json" aria-label="Choose lesson export file" onChange={(event) => importFile(event.target.files?.[0])}/>
    </div></div>
    <div className="report-lesson-filters" aria-label="Lesson filters">
      <label>Kind<select value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">All kinds</option>{['position', 'move', 'leak', 'opening_line'].map((entry) => <option key={entry}>{entry}</option>)}</select></label>
      <label>Tag<select value={tag} onChange={(event) => setTag(event.target.value)}><option value="all">All tags</option>{tags.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
      <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="mastered">Mastered</option></select></label>
    </div>
    {notice && <p role="status" aria-live="polite" className="report-message">{notice}</p>}
    {error && <p className="report-message report-error" role="alert">{error}</p>}
    <h3>Suggested lessons</h3>
    {suggestions.length ? <ul className="report-lesson-list">{suggestions.slice(0, 5).map((suggestion) => <li className="folder-card" key={suggestion.id}><strong>{suggestion.suggestionType === 'pattern' ? `Pattern · ${suggestion.title} · ${formatCount(suggestion.repeatCount, 'occurrence')}` : `Single blunder · ${suggestion.playedMove || 'Position'}`}</strong><p>{suggestion.whatHappened}</p><p>{formatCount(suggestion.gameCount ?? suggestion.sourceGameIds.length, 'game')} · about {Math.round(suggestion.pointsLost * 100)} winning-chance points lost</p><button className="button button-outline" type="button" onClick={() => openLesson(suggestion)}>Save lesson</button></li>)}</ul> : games.length && !['complete', 'error'].includes(analysisStatus) ? <p className="folder-card report-empty" role="status">Analyzing your moves. Suggestions will appear when this is complete.</p> : <p className="folder-card report-empty">No repeated flagged moves are ready to suggest yet. Suggested lessons are never saved automatically.</p>}
    <h3>Lessons in your recent games</h3>
    {matches.length ? <ul className="report-lesson-list">{matches.slice(0, 30).map((match) => <li className="folder-card" key={`${match.lessonId}:${match.gameId}:${match.ply}`}><strong>{match.label} · {match.lesson.playedMove || 'position'}</strong><p>{match.reason} {match.repeatedMistake ? 'You repeated the mistake.' : 'You handled this one better.'}</p><p>Confidence: {match.confidence}. Lesson: {match.lesson.myNote || match.lesson.howToImprove || match.lesson.whatHappened}</p></li>)}</ul> : games.length && !['complete', 'error'].includes(analysisStatus) ? <p className="folder-card report-empty" role="status">Recent lesson matches appear after game analysis completes.</p> : <p className="folder-card report-empty">No saved lesson matches these recent games yet.</p>}
    <h3>Saved lessons ({lessons.length}/{limits.maxSavedLessons})</h3>
    {!filtered.length ? <p className="folder-card report-empty">No lessons match these filters.</p> : <ul className="report-lesson-list">{filtered.map((lesson) => <LessonCard key={lesson.id} lesson={lesson} trainingEnabled={limits.trainingEnabled} onUpdate={mutate} onPractice={() => requestPracticeFromReport(buildPracticePositionFromLesson(lesson))} onDelete={() => mutate(() => deleteLesson(lesson.id))}/>)}</ul>}
    {lessons.length >= limits.maxSavedLessons && <p className="small-meta">You have reached the {limits.maxSavedLessons}-lesson limit. Export your lessons before deleting any to make room.</p>}
    <div className="report-lessons-delete">
      {confirmDelete ? <><p>Export your lessons first. This permanently deletes the lessons stored in this browser.</p><button className="button button-outline" type="button" onClick={() => mutate(async () => { await deleteAllLessons(); setConfirmDelete(false); })}>Confirm delete my lessons</button><button className="button button-outline" type="button" onClick={() => setConfirmDelete(false)}>Cancel</button></>
        : <button className="button button-outline" type="button" disabled={!lessons.length} onClick={() => setConfirmDelete(true)}>Delete my lessons</button>}
    </div>
    {leaks.length > 0 && <span className="report-screenreader">Lesson recommendations use repeated flagged positions and losing chances.</span>}
  </section>;
}

function LessonCard({ lesson, trainingEnabled, onPractice, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false); const [note, setNote] = useState(lesson.myNote || ''); const [confirm, setConfirm] = useState(false);
  return <li className="folder-card report-saved-lesson">
    <div className="report-tree-detail-heading"><div><strong>{lesson.kind.replace('_', ' ')} · {lesson.playedMove || lesson.openingName || 'position'}</strong><p className="small-meta">{lesson.status} · {lesson.source} · {lesson.tags?.join(', ') || 'no tags'}</p></div>{trainingEnabled && <button className="button button-outline" type="button" onClick={onPractice}>Practice this</button>}</div>
    <p>{lesson.whatHappened}</p><p>{lesson.howToImprove}</p>
    {editing ? <><label>My note<textarea value={note} onChange={(event) => setNote(event.target.value)}/></label><button className="button button-outline" type="button" onClick={() => { onUpdate(() => updateLesson(lesson.id, { myNote: note })); setEditing(false); }}>Save note</button><button className="button button-outline" type="button" onClick={() => setEditing(false)}>Cancel</button></>
      : <><p>{lesson.myNote || 'No personal note yet.'}</p><button className="button button-outline" type="button" onClick={() => setEditing(true)}>Edit note</button></>}
    {lesson.status === 'active' ? <button className="button button-outline" type="button" onClick={() => onUpdate(() => updateLesson(lesson.id, { status: 'mastered' }))}>Mark mastered</button> : <button className="button button-outline" type="button" onClick={() => onUpdate(() => updateLesson(lesson.id, { status: 'active' }))}>Reopen lesson</button>}
    {confirm ? <><span>Delete this lesson?</span><button className="button button-outline" type="button" onClick={() => onDelete()}>Confirm delete</button><button className="button button-outline" type="button" onClick={() => setConfirm(false)}>Cancel</button></> : <button className="button button-outline" type="button" onClick={() => setConfirm(true)}>Delete</button>}
  </li>;
}
