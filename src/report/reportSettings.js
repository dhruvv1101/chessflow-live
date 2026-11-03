import { loadSettings, saveSettings } from '../settings.js';

export const REPORT_THEME_CHANGED = 'chessflow:report-theme-changed';

export function updateReportTheme(theme) {
  if (!['system', 'light', 'dark'].includes(theme)) throw new TypeError('Choose light, dark or system theme.');
  const settings = saveSettings({ ...loadSettings(), theme });
  window.dispatchEvent(new CustomEvent(REPORT_THEME_CHANGED, { detail: { theme: settings.theme } }));
  return settings.theme;
}
