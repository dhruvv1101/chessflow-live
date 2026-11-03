export const FREE_LIMITS = Object.freeze({
  maxGames: 25,
  analysisDepth: 10,
  lossThresholds: Object.freeze({ inaccuracy: 0.05, mistake: 0.15, blunder: 0.25 }),
  topLeaks: 3,
  drillsPerDay: 5,
});
