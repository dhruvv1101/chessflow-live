import { describe, expect, it, vi } from 'vitest';
import { analyzeWithRouter } from './engineRouter.js';

const common = { fen: 'startpos', options: {}, purpose: 'hint', positionId: 1, getPositionId: () => 1 };

describe('hint engine router', () => {
  it('uses browser analysis directly when the server is not selected or configured', async () => {
    const browserAnalyze = vi.fn().mockResolvedValue({ best: 'e2e4' });
    const result = await analyzeWithRouter({ ...common, hintEngine: 'browser', browserAnalyze, remoteAnalyze: vi.fn() });
    expect(result.best).toBe('e2e4');
    expect(browserAnalyze).toHaveBeenCalledOnce();
  });

  it('falls back visibly to browser analysis when the server request fails', async () => {
    const browserAnalyze = vi.fn().mockResolvedValue({ best: 'e2e4', engineInfo: { name: 'Stockfish 19', build: 'Full' } });
    const onFallback = vi.fn();
    const result = await analyzeWithRouter({ ...common, hintEngine: 'server', browserAnalyze, onFallback,
      remoteAnalyze: vi.fn().mockRejectedValue(new Error('busy')) });
    expect(result.engineInfo.source).toBe('Using browser engine');
    expect(result.engineInfo.fallbackReason).toBe('busy');
    expect(onFallback).toHaveBeenCalledOnce();
  });
});
