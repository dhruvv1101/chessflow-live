import { describe, expect, it } from 'vitest';
import { FREE_LIMITS } from './config.js';
import { useEntitlement } from './useEntitlement.js';

describe('free report entitlement', () => {
  it('exposes the specified limits from one config and defaults to free', () => {
    expect(FREE_LIMITS).toMatchObject({ maxGames: 25, analysisDepth: 10, lossThresholds: { inaccuracy: 0.05, mistake: 0.15, blunder: 0.25 }, topLeaks: 3, drillsPerDay: 5 });
    expect(FREE_LIMITS).not.toHaveProperty('lookbackDays');
    expect(useEntitlement()).toEqual({ tier: 'free', limits: FREE_LIMITS });
  });
});
