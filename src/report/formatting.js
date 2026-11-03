export const formatSeconds = (value) => Number.isFinite(value) ? `${value.toFixed(1)}s` : 'unknown';
export const formatWinProbability = (value) => Number.isFinite(value) ? `${Math.round(value * 100)}%` : 'unknown';
export const formatLostSwing = (value) => `-${Math.round(Math.abs(Number(value) || 0) * 100)} points`;

export function formatCount(value, singular, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

export function formatLeakLossSummary(leak) {
  const total = Number.isFinite(leak?.expectedScoreLoss) ? leak.expectedScoreLoss.toFixed(1) : '0.0';
  const average = Math.round((Number(leak?.averageSwing) || 0) * 100);
  return `about ${total} points lost over ${formatCount(leak?.frequency || 0, 'occurrence')} (avg ${average} percentage points each)`;
}
