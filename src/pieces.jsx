import React from 'react';

// Original, hand-drawn silhouettes made for ChessFlow Live.
const shapes = {
  p: <><circle cx="50" cy="22" r="12"/><path d="M38 40c-1 7 2 13 7 17-12 6-19 19-20 30h50c-1-11-8-24-20-30 5-4 8-10 7-17H38Z"/><path d="M27 87h46"/></>,
  r: <><path d="M25 14h12v12h9V14h9v12h9V14h12v23l-7 8v36H32V45l-7-8V14Z"/><path d="M32 45h36M32 81h36M21 88h58"/></>,
  n: <><path d="M24 83c2-12 7-23 17-31-5-7-8-16-7-27l14 9 4-17 13 16c12 12 17 27 13 50H24Z"/><path d="m47 47 11 4M28 83h51"/><circle cx="58" cy="35" r="2" fill="var(--piece-white-fill)" stroke="none"/></>,
  b: <><path d="M50 12c12 10 16 20 11 30 9 6 14 16 13 29H26c-1-13 4-23 13-29-5-10-1-20 11-30Z"/><path d="m43 27 14 13M29 74h42M24 84h52"/></>,
  q: <><path d="m22 25 17 18 11-28 11 28 17-18-6 47H28l-6-47Z"/><circle cx="22" cy="20" r="5"/><circle cx="50" cy="12" r="5"/><circle cx="78" cy="20" r="5"/><path d="M29 72h42M24 84h52"/></>,
  k: <><path d="M44 10h12v13h13v11H56v8c12 6 19 17 18 33H26c-1-16 6-27 18-33v-8H31V23h13V10Z"/><path d="M28 75h44M23 85h54"/></>,
};

function makePiece(kind, color) {
  const dark = color === 'b';
  return function ChessFlowPiece({ svgStyle } = {}) {
    return <svg aria-hidden="true" viewBox="0 0 100 100" width="100%" height="100%" style={svgStyle}>
      <g className={dark ? 'piece-dark-glyph' : 'piece-white-glyph'} fill={dark ? 'var(--piece-dark-fill)' : 'var(--piece-white-fill)'} stroke={dark ? 'var(--piece-dark-outline)' : 'var(--piece-white-outline, #000)'} strokeWidth="var(--piece-stroke-width, 5px)" strokeLinecap="round" strokeLinejoin="round">
        {shapes[kind]}
      </g>
    </svg>;
  };
}

export const CHESS_PIECES = Object.fromEntries(
  ['p', 'r', 'n', 'b', 'q', 'k'].flatMap((kind) => [
    [`w${kind.toUpperCase()}`, makePiece(kind, 'w')],
    [`b${kind.toUpperCase()}`, makePiece(kind, 'b')],
  ]),
);
