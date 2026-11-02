import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  auth: { getUser: vi.fn(), onAuthStateChange: vi.fn(), signInWithOAuth: vi.fn(), signInWithOtp: vi.fn(), signOut: vi.fn() },
  from: vi.fn(), callback: null,
}));
vi.mock('./cloud/supabase.js', () => ({ supabase: mock }));

import CloudSavesPanel from './CloudSavesPanel.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root;
let host;

async function renderPanel() {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<CloudSavesPanel fen="start" pgn="" onLoad={() => {}}/>));
  await act(async () => { await Promise.resolve(); });
  return host;
}

beforeEach(() => {
  const query = { select: vi.fn(() => query), order: vi.fn().mockResolvedValue({ data: [], error: null }), insert: vi.fn().mockResolvedValue({ error: null }) };
  mock.from.mockReturnValue(query);
  mock.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
  mock.auth.onAuthStateChange.mockImplementation((callback) => { mock.callback = callback; return { data: { subscription: { unsubscribe: vi.fn() } } }; });
  mock.auth.signInWithOAuth.mockResolvedValue({ error: null });
  mock.auth.signInWithOtp.mockResolvedValue({ error: null });
  mock.auth.signOut.mockImplementation(async () => { mock.callback?.('SIGNED_OUT', null); return { error: null }; });
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove(); root = null; host = null;
  vi.clearAllMocks();
});

describe('cloud save sign-in controls', () => {
  it('shows enabled buttons in GitHub-then-email order and hides Google by default', async () => {
    const node = await renderPanel();
    const buttons = [...node.querySelectorAll('button')].map((button) => button.textContent);
    expect(buttons.indexOf('Continue with GitHub')).toBeLessThan(buttons.indexOf('Send magic link'));
    expect(buttons).not.toContain('Continue with Google');
  });

  it('shows provider-disabled and email-rate-limit messages without raw provider payloads', async () => {
    mock.auth.signInWithOAuth.mockResolvedValueOnce({ error: { message: 'Unsupported provider: provider is not enabled', details: '{raw}' } });
    mock.auth.signInWithOtp.mockResolvedValueOnce({ error: { status: 429, message: 'rate limit exceeded', details: '{raw}' } });
    const node = await renderPanel();
    await act(async () => node.querySelector('button')?.click());
    expect(node.textContent).toContain("GitHub sign-in isn't set up yet");
    const input = node.querySelector('input[type="email"]');
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'player@example.test'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => [...node.querySelectorAll('button')].find((button) => button.textContent === 'Send magic link').click());
    expect(node.textContent).toContain('Too many emails were sent');
    expect(node.textContent).not.toContain('{raw}');
  });

  it('shows the signed-in account and signs out', async () => {
    mock.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'id-1', email: 'player@example.test' } }, error: null });
    const node = await renderPanel();
    expect(node.textContent).toContain('Signed in as player@example.test');
    await act(async () => node.querySelector('button.button-outline:last-of-type')?.click());
    expect(mock.auth.signOut).toHaveBeenCalledOnce();
    expect(node.textContent).toContain('Signed out.');
  });
});
