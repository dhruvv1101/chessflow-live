import { Chess } from 'chess.js';

export const REPORT_PRACTICE_EVENT = 'chessflow:practice-from-position';

function normalizePositionKey(fen) {
  return String(fen || '').trim().split(/\s+/).slice(0, 4).join(' ');
}

export function buildPracticePositionFromNode(node) {
  const game = new Chess(node?.commonPathStartFen || undefined);
  for (const san of node?.commonPathSans || []) {
    if (!game.move(san)) throw new Error(`Cannot start practice: illegal path move ${san}.`);
  }
  const fen = game.fen();
  const positionKey = normalizePositionKey(node?.positionKey);
  if (!positionKey || normalizePositionKey(fen) !== positionKey) throw new Error('Cannot start practice: the tree path does not reach this position.');
  return {
    fen, color: game.turn(),
    gameKey: node.exampleGameIds?.[0] || `position:${positionKey}`,
    ply: Number(node.movePly) || (node.commonPathSans?.length || 0) + 1,
  };
}

export function buildPracticePositionFromLesson(lesson) {
  const positionKey = normalizePositionKey(lesson?.normalizedFen);
  if (!positionKey) throw new Error('This lesson has no saved position.');
  const game = new Chess(`${positionKey} 0 1`);
  return {
    fen: game.fen(), color: game.turn(),
    gameKey: lesson.sourceGameIds?.[0] || `lesson:${lesson.id || positionKey}`,
    ply: 0,
  };
}

export function requestPracticeFromReport(position) {
  const game = new Chess(position?.fen);
  const detail = { ...position, color: game.turn() };
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(REPORT_PRACTICE_EVENT, { detail }));
  return detail;
}
