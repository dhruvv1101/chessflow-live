import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings } from '../settings.js';
import { REPORT_THEME_CHANGED, updateReportTheme } from './reportSettings.js';

afterEach(() => localStorage.removeItem(SETTINGS_KEY));

describe('Report theme setting', () => {
  it('saves the selected theme using the shared app settings and notifies the app shell', () => {
    const listener = vi.fn();
    window.addEventListener(REPORT_THEME_CHANGED, listener);

    expect(updateReportTheme('dark')).toBe('dark');

    expect(loadSettings().theme).toBe('dark');
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0].detail).toEqual({ theme: 'dark' });
    window.removeEventListener(REPORT_THEME_CHANGED, listener);
  });

  it('rejects unsupported theme values without changing saved settings', () => {
    expect(() => updateReportTheme('sepia')).toThrow('Choose light, dark or system theme.');
    expect(loadSettings().theme).toBe(DEFAULT_SETTINGS.theme);
  });
});
