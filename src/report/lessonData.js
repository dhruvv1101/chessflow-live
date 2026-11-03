import { FREE_LIMITS } from './config.js';
import { Chess } from 'chess.js';

export function normalizeLessonFen(fen) {
  return String(fen || '').trim().split(/\s+/).slice(0, 4).join(' ');
}

const tagRules = {
  'missed-capture': 'Before capturing, check what the opponent’s last move attacks and list every capture and check.',
  missed_capture: 'Before capturing, check what the opponent’s last move attacks and list every capture and check.',
  'played-capture-lost-value': 'Before taking material, check whether the captured piece is defended and what can be taken back.',
  'allowed-capture-hung-piece': 'After every move, scan for opponent captures and ask which of your pieces became undefended.',
  hung_piece: 'After every move, scan for opponent captures and ask which of your pieces became undefended.',
  'missed_opponent_threat': 'After the opponent moves, identify their threat before choosing your own plan.',
  missed_mate: 'After every forcing move, check for a legal checkmate and compare all checks before settling on a plan.',
  missedChance: 'After an opponent mistake, pause and list all forcing captures and checks before moving.',
  'lost-advantage': 'When ahead, compare candidate moves and choose the line that keeps the win secure.',
  opening: 'Develop pieces, contest the center and secure your king before starting a side attack.',
  endgame: 'Activate your king and compare pawn races before committing to a pawn move.',
};

function percent(score) { return Number.isFinite(score) ? `${Math.round(score * 100)}%` : 'unknown'; }

export function lessonWhyLikely({ tags = [], timeContext, timeSpentSeconds, opponentMistake } = {}) {
  const reasons = [];
  const label = (Array.isArray(tags) ? tags : []).map((tag) => typeof tag === 'string' ? tag : tag?.kind).filter(Boolean);
  if (opponentMistake && Number.isFinite(timeSpentSeconds)) reasons.push(`likely: you replied in ${timeSpentSeconds.toFixed(1)}s right after the opponent’s mistake`);
  if (timeContext && timeContext !== 'unknown') reasons.push(`likely: this was a ${timeContext} move`);
  for (const tag of label) {
    const rule = tagRules[tag];
    if (rule) reasons.push(`likely: ${rule}`);
  }
  return reasons.length ? [...new Set(reasons)].join(' ') : 'No clear reason is recorded; add what you were thinking to remember the position.';
}

export function lessonDraftFromRow(row, game, extra = {}) {
  const before = row?.evaluationBefore?.winProbability;
  const after = row?.evaluationAfter?.winProbability;
  const playedMove = row?.playedSan || row?.notation?.replace(/^\d+\.\.\.\s*|^\d+\.\s*/, '') || '';
  const bestMove = row?.bestMoveSan || '';
  const tags = [...(row?.tacticTags || []).map((tag) => tag.kind), row?.tactic?.kind, row?.phase, row?.timeContext, row?.missedChance ? 'missedChance' : null, row?.lostAdvantage ? 'lost-advantage' : null].filter(Boolean);
  const whatHappened = `You played ${playedMove || 'a move'}. Your winning chances changed from ${percent(before)} to ${percent(after)}; the engine’s best was ${bestMove || 'not stored'}.`;
  const howToImprove = `${bestMove ? `Consider ${bestMove} and compare its engine line. ` : ''}${tags.map((tag) => tagRules[tag]).filter(Boolean).join(' ')}`.trim() || 'Review the engine’s best line and write down a candidate-move checklist.';
  return {
    kind: extra.kind || (row?.tacticTags?.length ? 'move' : 'position'),
    normalizedFen: normalizeLessonFen(row?.fenBefore || extra.normalizedFen),
    color: row?.userColor || game?.userColor || extra.color || 'white',
    playedMove, bestMove, openingName: row?.openingContext?.name || extra.openingName || '',
    tags, openingKey: normalizeLessonFen(row?.fenBefore || extra.normalizedFen) || extra.openingKey || null,
    sourceGameIds: game?.url ? [game.url] : (extra.sourceGameIds || []),
    winProbabilityBefore: Number.isFinite(before) ? before : null,
    winProbabilityAfter: Number.isFinite(after) ? after : null,
    opponentRefutationSan: row?.opponentPrincipalVariationSan || (row?.opponentResponseSan ? [row.opponentResponseSan] : []),
    whatHappened, whyLikely: lessonWhyLikely({ tags, timeContext: row?.timeContext, timeSpentSeconds: row?.timeSpentSeconds, opponentMistake: row?.missedChance }),
    howToImprove, whatIWasThinking: '', myNote: '', status: 'active', source: extra.source || 'saved by me',
    ...extra,
  };
}

export function suggestLessons(games, rows, { maxSuggestions = 5 } = {}) {
  const grouped = new Map();
  for (const row of rows || []) {
    if (!row.isUserMove || !['Inaccuracy', 'Mistake', 'Blunder'].includes(row.classification)) continue;
    const key = `${normalizeLessonFen(row.fenBefore)}|${row.playedSan}`;
    const item = grouped.get(key) || { key, row, count: 0, pointsLost: 0, sourceGameIds: new Set() };
    item.count += 1;
    item.pointsLost += Math.max(0, Number(row.winProbabilityLoss) || 0);
    item.sourceGameIds.add(row.gameKey);
    grouped.set(key, item);
  }
  return [...grouped.values()].map((item) => ({
    ...lessonDraftFromRow(item.row, games.find((game) => game.url === item.row.gameKey), { source: 'suggested' }),
    id: item.key, repeatCount: item.count, pointsLost: item.pointsLost,
    sourceGameIds: [...item.sourceGameIds], score: item.count * item.pointsLost,
  })).sort((a, b) => b.score - a.score).slice(0, maxSuggestions);
}

export function matchLesson(lesson, row, game, { openingKey = null } = {}) {
  if (lesson.status !== 'active') return null;
  const fen = normalizeLessonFen(row.fenBefore);
  const tags = new Set([...(row.tacticTags || []).map((tag) => tag.kind), row.tactic?.kind, row.phase, row.timeContext].filter(Boolean));
  let matchType = null;
  if (fen === lesson.normalizedFen && row.playedSan === lesson.playedMove && ['Inaccuracy', 'Mistake', 'Blunder'].includes(row.classification)) matchType = 'exact';
  else if ((lesson.openingKey && lesson.openingKey === openingKey) || (lesson.kind === 'opening_line' && lesson.normalizedFen === fen)) matchType = 'line';
  else if ((lesson.tags || []).some((tag) => tags.has(tag)) && lesson.tags?.includes(row.phase) && lesson.tags?.includes(row.timeContext)) matchType = 'pattern';
  if (!matchType) return null;
  const repeated = ['Inaccuracy', 'Mistake', 'Blunder'].includes(row.classification);
  return {
    lessonId: lesson.id, kind: matchType, label: matchType === 'pattern' ? 'Similar situation (likely)' : matchType === 'line' ? 'Same opening line' : 'Exact position and move',
    confidence: matchType === 'exact' ? 'high' : matchType === 'line' ? 'medium' : 'likely',
    repeatedMistake: repeated, handledBetter: !repeated,
    reason: matchType === 'exact' ? 'The position and your move match this saved lesson.' : matchType === 'line' ? 'This is the same saved opening position.' : 'The move shares a saved tag, phase and time context.',
    gameId: game?.url || row.gameKey, ply: row.ply,
  };
}

export function lessonExportPayload(lessons) {
  return { format: 'chessflow-lessons', version: 1, lessons: (lessons || []).map(({ id, ...lesson }) => lesson) };
}

export function validateLessonImport(payload, limit = FREE_LIMITS.maxSavedLessons) {
  if (payload?.format !== 'chessflow-lessons' || payload?.version !== 1 || !Array.isArray(payload.lessons)) throw new Error('This file is not a supported ChessFlow lessons export.');
  if (payload.lessons.length > limit) throw new Error(`This file has more than the ${limit}-lesson limit.`);
  return payload.lessons.map((lesson) => {
    if (!lesson || !['position', 'move', 'leak', 'opening_line'].includes(lesson.kind) || !lesson.normalizedFen) throw new Error('The lessons file contains an invalid lesson.');
    const normalizedFen = normalizeLessonFen(lesson.normalizedFen);
    try { new Chess(`${normalizedFen} 0 1`); } catch { throw new Error('The lessons file contains an invalid chess position.'); }
    const boundedText = (value) => String(value || '').slice(0, 2000);
    return {
      kind: lesson.kind, normalizedFen, color: lesson.color === 'black' ? 'black' : 'white',
      playedMove: boundedText(lesson.playedMove), bestMove: boundedText(lesson.bestMove), openingName: boundedText(lesson.openingName), openingKey: boundedText(lesson.openingKey),
      tags: Array.isArray(lesson.tags) ? lesson.tags.slice(0, 30).map((tag) => boundedText(tag)) : [],
      sourceGameIds: Array.isArray(lesson.sourceGameIds) ? lesson.sourceGameIds.slice(0, 30).map((id) => boundedText(id)) : [],
      winProbabilityBefore: Number.isFinite(lesson.winProbabilityBefore) ? lesson.winProbabilityBefore : null,
      winProbabilityAfter: Number.isFinite(lesson.winProbabilityAfter) ? lesson.winProbabilityAfter : null,
      correctHandlings: Number.isSafeInteger(lesson.correctHandlings) && lesson.correctHandlings >= 0 ? lesson.correctHandlings : 0,
      handlingKeys: Array.isArray(lesson.handlingKeys) ? lesson.handlingKeys.slice(0, 100).map((key) => boundedText(key)) : [],
      opponentRefutationSan: Array.isArray(lesson.opponentRefutationSan) ? lesson.opponentRefutationSan.slice(0, 12).map((move) => boundedText(move)) : [],
      whatHappened: boundedText(lesson.whatHappened), whyLikely: boundedText(lesson.whyLikely), howToImprove: boundedText(lesson.howToImprove),
      whatIWasThinking: boundedText(lesson.whatIWasThinking), myNote: boundedText(lesson.myNote),
      status: lesson.status === 'mastered' ? 'mastered' : 'active', source: 'saved by me',
    };
  });
}
