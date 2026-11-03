export const FREE_LIMITS = Object.freeze({
  maxGames: 25,
  analysisDepth: 10,
  lossThresholds: Object.freeze({ inaccuracy: 0.05, mistake: 0.15, blunder: 0.25 }),
  openingNoiseMinWinProbabilityLoss: 0.08,
  lostAdvantage: Object.freeze({ minimumBeforeCp: 200, minimumDropCp: 100 }),
  timeContext: Object.freeze({
    instantMoveMaxSeconds: 2,
    lowClockSeconds: 30,
    longThinkMinSeconds: 30,
    longThinkClockRatio: 0.25,
    longThinkAverageMultiplier: 2,
  }),
  phaseThresholds: Object.freeze({
    openingMaxFullmove: 10,
    openingMinMaterial: 50,
    endgameMaterialNoQueens: 32,
    endgameMaterialAnyQueen: 18,
  }),
  topLeaks: 3,
  drillsPerDay: 5,
});
