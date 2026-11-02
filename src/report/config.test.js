import { describe, expect, it } from 'vitest';
import { FREE_LIMITS } from './config.js';
import { useEntitlement } from './useEntitlement.js';

describe('free report entitlement', () => {
  it('exposes the specified limits from one config and defaults to free', () => {
    expect(FREE_LIMITS).toMatchObject({ lookbackDays: 30, maxGames: 25, analysisDepth: 10, topLeaks: 3, drillsPerDay: 5 });
    expect(useEntitlement()).toEqual({ tier: 'free', limits: FREE_LIMITS });
  });
});
