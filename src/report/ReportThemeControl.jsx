import { useEffect, useState } from 'react';
import { loadSettings } from '../settings.js';
import { REPORT_THEME_CHANGED, updateReportTheme } from './reportSettings.js';

export default function ReportThemeControl() {
  const [theme, setTheme] = useState(() => loadSettings().theme);

  useEffect(() => {
    const syncTheme = (event) => setTheme(event.detail?.theme || loadSettings().theme);
    window.addEventListener(REPORT_THEME_CHANGED, syncTheme);
    return () => window.removeEventListener(REPORT_THEME_CHANGED, syncTheme);
  }, []);

  return <label className="setting-select report-theme-control">
    Theme
    <select aria-label="Report theme" value={theme} onChange={(event) => setTheme(updateReportTheme(event.target.value))}>
      <option value="system">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  </label>;
}
