import { describe, expect, it } from 'vitest';
import { FREE_LIMITS } from './config.js';
import { buildReportHelpItems } from './ReportHelpDrawer.jsx';

describe('report help copy', () => {
  it('derives sample, threshold and depth numbers from the entitlement config', () => {
    const items = Object.fromEntries(buildReportHelpItems(FREE_LIMITS));
    expect(items['Show below-minimum lines']).toContain(`${FREE_LIMITS.reportInsights.minimumSampleGames}`);
    expect(items.Confidence).toContain(`${FREE_LIMITS.reportInsights.lowConfidenceGames}`);
    expect(items.Confidence).toContain(`${FREE_LIMITS.reportInsights.goodSampleGames}`);
    expect(items['Analysis depth']).toContain(`${FREE_LIMITS.analysisDepth}`);
    expect(items['Inaccuracy / Mistake / Blunder']).toContain(`${FREE_LIMITS.lossThresholds.blunder * 100}`);
    expect(items['Lost advantage']).toContain(`${FREE_LIMITS.lostAdvantage.minimumBeforeWinProbability * 100}`);
  });
});
