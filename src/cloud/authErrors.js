const env = import.meta.env || {};

export function enabledAuthProviders(values = env) {
  return {
    github: values.VITE_AUTH_GITHUB_ENABLED !== 'false',
    email: values.VITE_AUTH_EMAIL_ENABLED !== 'false',
    google: values.VITE_AUTH_GOOGLE_ENABLED === 'true',
  };
}

export function authErrorMessage(error, provider = 'Email') {
  const text = `${error?.message || ''} ${error?.code || ''} ${error?.status || ''}`.toLowerCase();
  if (text.includes('provider') && (text.includes('not enabled') || text.includes('unsupported'))) return `${provider} sign-in isn't set up yet`;
  if (text.includes('429') || text.includes('rate limit') || text.includes('too many')) return 'Too many emails were sent. Try again in an hour or use GitHub sign-in';
  if ((text.includes('email address') || text.includes('email_address')) && (text.includes('not authorized') || text.includes('not_authorized') || text.includes('not allowed'))) return 'Email sign-in is limited to the site owner right now. Use GitHub sign-in';
  if (text.includes('network') || text.includes('fetch') || text.includes('failed to reach') || text.includes('connection')) return 'Could not reach the sign-in service';
  return `${provider} sign-in could not be completed. Please try again.`;
}

export function isAuthRedirectUrl(location = globalThis.location) {
  const hash = String(location?.hash || '');
  const query = String(location?.search || '');
  return /(?:access_token|refresh_token|code|error)=/.test(`${hash}&${query}`);
}
