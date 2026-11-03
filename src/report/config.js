export const FREE_LIMITS = Object.freeze({
  maxGames: 25,
  // Require three actual moves by the imported player; very short games do
  // not count toward the free import cap or behavioral statistics.
  minimumUserMoves: 3,
  analysisDepth: 10,
  lossThresholds: Object.freeze({ inaccuracy: 0.05, mistake: 0.15, blunder: 0.25 }),
  openingNoiseMinWinProbabilityLoss: 0.08,
  bestMoveMarginCp: 25,
  lostAdvantage: Object.freeze({ minimumBeforeWinProbability: 0.8, maximumAfterWinProbability: 0.65 }),
  timeContext: Object.freeze({
    instantMoveBaseRatio: 0.003,
    longThinkClockRatio: 0.25,
    longThinkAverageMultiplier: 2,
    byClass: Object.freeze({
      bullet: Object.freeze({ instantMoveMaxSeconds: 0.1, lowClockRatio: 0.15, lowClockMinSeconds: 5, lowClockMaxSeconds: 15, longThinkBaseRatio: 0.15, longThinkMinSeconds: 8 }),
      blitz: Object.freeze({ instantMoveMaxSeconds: 0.3, lowClockRatio: 0.1, lowClockMinSeconds: 10, lowClockMaxSeconds: 45, longThinkBaseRatio: 0.1, longThinkMinSeconds: 20 }),
      rapid: Object.freeze({ instantMoveMaxSeconds: 0.7, lowClockRatio: 0.08, lowClockMinSeconds: 30, lowClockMaxSeconds: 120, longThinkBaseRatio: 0.08, longThinkMinSeconds: 40 }),
      default: Object.freeze({ instantMoveMaxSeconds: 0.3, lowClockSeconds: 30, longThinkMinSeconds: 30 }),
    }),
  }),
  phaseThresholds: Object.freeze({
    openingMaxFullmove: 10,
    openingMinMaterial: 50,
    endgameMaterialNoQueens: 32,
    endgameMaterialAnyQueen: 18,
  }),
  reportInsights: Object.freeze({
    minimumSampleGames: 2,
    lowConfidenceGames: 3,
    goodSampleGames: 3,
    initialTreeDepth: 10,
    maxExampleGames: 3,
    openingLeakExpectedScoreGap: 0.15,
    firstBigMistakeMinimumWinProbabilityLoss: 0.15,
    timeLeakMinimumRateDifference: 0.15,
    timeLeakMinimumMoves: 3,
  }),
  topLeaks: 3,
  trainingEnabled: false,
  drillsPerDay: 5,
  maxSavedLessons: 15,
  correctHandlingsToMaster: 3,
});
