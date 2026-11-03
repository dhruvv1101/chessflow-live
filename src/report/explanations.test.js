import { describe, expect, it, vi } from 'vitest';
import { buildMoveExplanation } from './explanations.js';

describe('deterministic report move explanations', () => {
  it('uses stored legal SAN engine lines and reports the played and best move', async () => {
    const result = await buildMoveExplanation({
      notation: '14. h3', playedSan: 'h3', bestMoveSan: 'Bf4', opponentResponseSan: 'Qh4+',
      opponentPrincipalVariationSan: ['Qh4+', 'g3', 'Qf6'], evaluationBefore: { userScore: { cp: 418 } }, evaluationAfter: { userScore: { cp: 281 } },
      missedChance: { opponentMoveNotation: '13... Be7', opponentMoveClassification: 'Blunder', bestReplySan: 'Bf4', playedSan: 'h3' },
    });
    expect(result).toMatchObject({ played: '14. h3', opponentReply: 'Qh4+', opponentLine: ['Qh4+', 'g3', 'Qf6'], bestMove: 'Bf4', evaluationBefore: '+4.18', evaluationAfter: '+2.81' });
    expect(result.opponentContext).toContain('13... Be7');
  });

  it('reanalyzes a flagged position only when the PV is absent, then caches its legal SAN line', async () => {
    const cache = { get: vi.fn(async () => null), put: vi.fn(async () => {}) };
    const reanalyze = vi.fn(async () => ({ pvUci: ['e7e5', 'g1f3'], depth: 10 }));
    const result = await buildMoveExplanation({ fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', evaluationAfter: { userScore: { cp: 0 } } }, { cache, reanalyze, depth: 10 });
    expect(reanalyze).toHaveBeenCalledOnce();
    expect(cache.put).toHaveBeenCalledOnce();
    expect(result.opponentLine).toEqual(['e5', 'Nf3']);
  });
});
