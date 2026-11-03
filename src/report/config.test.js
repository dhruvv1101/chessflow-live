import { describe, expect, it } from 'vitest';
import { FREE_LIMITS } from './config.js';
import { useEntitlement } from './useEntitlement.js';

describe('free report entitlement', () => {
  it('exposes the specified limits from one config and defaults to free', () => {
    expect(FREE_LIMITS).toMatchObject({
      maxGames: 25, minimumUserMoves: 3, analysisDepth: 10,
      lossThresholds: { inaccuracy: 0.05, mistake: 0.15, blunder: 0.25 },
      openingNoiseMinWinProbabilityLoss: 0.08,
      lostAdvantage: { minimumBeforeWinProbability: 0.8, maximumAfterWinProbability: 0.65 },
      bestMoveMarginCp: 25,
      timeContext: {
        instantMoveBaseRatio: 0.003,
        longThinkClockRatio: 0.25,
        longThinkAverageMultiplier: 2,
        byClass: {
          bullet: { instantMoveMaxSeconds: 0.1, lowClockRatio: 0.15, lowClockMinSeconds: 5, lowClockMaxSeconds: 15, longThinkBaseRatio: 0.15, longThinkMinSeconds: 8 },
          blitz: { instantMoveMaxSeconds: 0.3, lowClockRatio: 0.1, lowClockMinSeconds: 10, lowClockMaxSeconds: 45, longThinkBaseRatio: 0.1, longThinkMinSeconds: 20 },
          rapid: { instantMoveMaxSeconds: 0.7, lowClockRatio: 0.08, lowClockMinSeconds: 30, lowClockMaxSeconds: 120, longThinkBaseRatio: 0.08, longThinkMinSeconds: 40 },
          default: { instantMoveMaxSeconds: 0.3, lowClockSeconds: 30, longThinkMinSeconds: 30 },
        },
      },
      phaseThresholds: { openingMaxFullmove: 10, openingMinMaterial: 50, endgameMaterialNoQueens: 32, endgameMaterialAnyQueen: 18 },
      reportInsights: { minimumSampleGames: 2, lowConfidenceGames: 3, goodSampleGames: 3, maxExampleGames: 3, openingLeakExpectedScoreGap: 0.15, firstBigMistakeMinimumWinProbabilityLoss: 0.15, timeLeakMinimumRateDifference: 0.15, timeLeakMinimumMoves: 3 },
      topLeaks: 3, trainingEnabled: true, drillsPerDay: 5, maxSavedLessons: 15, correctHandlingsToMaster: 3,
    });
    expect(FREE_LIMITS).not.toHaveProperty('lookbackDays');
    expect(FREE_LIMITS.topLeaks).toBe(3);
    expect(FREE_LIMITS.trainingEnabled).toBe(true);
    expect(useEntitlement()).toEqual({ tier: 'free', limits: FREE_LIMITS });
  });
});
