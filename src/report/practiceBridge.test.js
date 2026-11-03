import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { buildPracticePositionFromLesson, buildPracticePositionFromNode, requestPracticeFromReport, REPORT_PRACTICE_EVENT } from './practiceBridge.js';

describe('report practice bridge', () => {
  it('reconstructs the full legal FEN from a selected tree path', () => {
    const game = new Chess();
    game.move('e4'); game.move('c5');
    const node = {
      commonPathStartFen: new Chess().fen(), commonPathSans: ['e4', 'c5'],
      positionKey: game.fen().split(' ').slice(0, 4).join(' '), movePly: 3,
      exampleGameIds: ['public-game-1'],
    };
    expect(buildPracticePositionFromNode(node)).toEqual({ fen: game.fen(), color: 'w', gameKey: 'public-game-1', ply: 3 });
  });

  it('restores a lesson position and uses the side to move', () => {
    const afterE4 = new Chess(); afterE4.move('e4');
    const position = buildPracticePositionFromLesson({ normalizedFen: afterE4.fen().split(' ').slice(0, 4).join(' '), color: 'white', sourceGameIds: ['game'] });
    expect(position).toMatchObject({ color: 'b', gameKey: 'game', ply: 0 });
    expect(new Chess(position.fen).fen().split(' ').slice(0, 4)).toEqual(position.fen.split(' ').slice(0, 4));
  });

  it('dispatches the validated practice request for the app shell', () => {
    let received;
    const listener = (event) => { received = event.detail; };
    window.addEventListener(REPORT_PRACTICE_EVENT, listener);
    requestPracticeFromReport({ fen: new Chess().fen(), color: 'w', gameKey: 'game', ply: 1 });
    window.removeEventListener(REPORT_PRACTICE_EVENT, listener);
    expect(received).toMatchObject({ color: 'w', gameKey: 'game', ply: 1 });
  });
});
