import { describe, expect, it } from 'vitest';
import { formatCount, formatLeakLossSummary, formatLostSwing, formatSeconds, formatWinProbability } from './formatting.js';

describe('report wording and number formatting', () => {
  it('rounds seconds and win chances and keeps losses negative', () => {
    expect(formatSeconds(4.600000000000023)).toBe('4.6s');
    expect(formatWinProbability(0.488)).toBe('49%');
    expect(formatLostSwing(0.488)).toBe('-49 points');
  });
  it('pluralizes suggestion counts', () => {
    expect(formatCount(1, 'time')).toBe('1 time');
    expect(formatCount(1, 'game')).toBe('1 game');
    expect(formatCount(2, 'game')).toBe('2 games');
  });
  it('keeps aggregate lost points at one decimal while showing probability changes as whole points', () => {
    expect(formatLeakLossSummary({ expectedScoreLoss: 4.471, averageSwing: 0.235, frequency: 19 })).toBe('about 4.5 points lost over 19 occurrences (avg 24 percentage points each)');
  });
});
