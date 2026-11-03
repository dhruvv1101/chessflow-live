import { describe, expect, it } from 'vitest';
import { authErrorMessage, enabledAuthProviders, isAuthRedirectUrl } from './authErrors.js';

describe('friendly authentication errors', () => {
  it('maps unconfigured providers, email limits, authorization, and network failures without exposing raw errors', () => {
    expect(authErrorMessage({ message: 'Unsupported provider: provider is not enabled' }, 'GitHub')).toBe("GitHub sign-in isn't set up yet");
    expect(authErrorMessage({ status: 429, message: 'rate limit exceeded' })).toMatch(/Too many emails.*hour/);
    expect(authErrorMessage({ message: 'Email address not authorized' })).toMatch(/limited to the site owner/);
    expect(authErrorMessage({ message: 'Failed to fetch' })).toBe('Could not reach the sign-in service');
    expect(authErrorMessage({ message: 'raw server JSON: private detail' })).not.toContain('private detail');
  });

  it('defaults to GitHub, email and Google, and permits hiding each provider', () => {
    expect(enabledAuthProviders({})).toEqual({ github: true, email: true, google: true });
    expect(enabledAuthProviders({ VITE_AUTH_GOOGLE_ENABLED: 'false' })).toEqual({ github: true, email: true, google: false });
    expect(enabledAuthProviders({ VITE_AUTH_GITHUB_ENABLED: 'false', VITE_AUTH_EMAIL_ENABLED: 'false', VITE_AUTH_GOOGLE_ENABLED: 'true' })).toEqual({ github: false, email: false, google: true });
  });

  it('detects auth redirects so callback tokens and codes can be removed from the URL', () => {
    expect(isAuthRedirectUrl({ hash: '#access_token=hidden', search: '' })).toBe(true);
    expect(isAuthRedirectUrl({ hash: '', search: '?code=callback' })).toBe(true);
    expect(isAuthRedirectUrl({ hash: '', search: '?tab=settings' })).toBe(false);
  });
});
