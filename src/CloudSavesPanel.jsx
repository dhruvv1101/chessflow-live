import React, { useEffect, useState } from 'react';
import { supabase } from './cloud/supabase.js';
import { authErrorMessage, enabledAuthProviders, isAuthRedirectUrl } from './cloud/authErrors.js';
import { listLocalSaves, saveLocalGame } from './cloud/savedGames.js';

const providers = enabledAuthProviders();

export default function CloudSavesPanel({ fen, pgn, onLoad }) {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [saves, setSaves] = useState([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    const hasAuthRedirect = isAuthRedirectUrl();
    supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (error) { setUser(null); setMessage('Your sign-in session expired. Please sign in again.'); return; }
      setUser(data.user || null);
      if (data.user && hasAuthRedirect) setMessage(`Signed in as ${data.user.email || 'your account'}.`);
    }).catch(() => { if (active) setMessage('Could not reach the sign-in service'); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION' && hasAuthRedirect) && session?.user) setMessage(`Signed in as ${session.user.email || 'your account'}.`);
      if (event === 'SIGNED_OUT') setMessage('Signed out.');
      if (event === 'TOKEN_REFRESHED' && !session) setMessage('Your sign-in session expired. Please sign in again.');
    });
    if (hasAuthRedirect) window.history.replaceState(null, '', window.location.pathname);
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!supabase) { listLocalSaves().then(setSaves).catch(() => setSaves([])); return; }
    if (!user) { setSaves([]); return; }
    let active = true;
    supabase.from('saved_games').select('id,name,fen,pgn,updated_at').order('updated_at', { ascending: false }).then(({ data, error }) => {
      if (!active) return;
      if (error) setMessage('Could not load saved games. Please try again.'); else setSaves(data || []);
    }).catch(() => { if (active) setMessage('Could not load saved games. Please try again.'); });
    return () => { active = false; };
  }, [user]);

  const run = async (provider, action) => {
    setBusy(true); setMessage('');
    try {
      const { error } = await action();
      if (error) throw error;
    } catch (error) { setMessage(authErrorMessage(error, provider)); }
    finally { setBusy(false); }
  };
  const signIn = (provider) => run(provider, () => supabase.auth.signInWithOAuth({ provider: provider.toLowerCase(), options: { redirectTo: window.location.origin } }));

  if (!supabase) return <section className="settings-section" aria-labelledby="cloud-saves-title">
    <h3 id="cloud-saves-title">Saved games</h3><p className="small-meta">Saved locally in this browser with IndexedDB. Configure Supabase to sync across devices.</p>
    <button className="button button-yellow" disabled={busy} onClick={() => run('Save', async () => { await saveLocalGame({ name: `Game ${new Date().toLocaleString()}`, fen, pgn }); setSaves(await listLocalSaves()); setMessage('Game saved in this browser.'); return {}; })}>Save current game locally</button>
    <div className="cloud-save-list">{saves.map((save) => <button className="button button-outline" key={save.id} onClick={() => onLoad(save)}>{save.name} · {new Date(save.updated_at).toLocaleDateString()}</button>)}</div>
    {message && <p className="small-meta" role="status">{message}</p>}
  </section>;

  return <section className="settings-section" aria-labelledby="cloud-saves-title">
    <h3 id="cloud-saves-title">Cloud saves</h3>
    {!user ? <>
      {providers.github && <button className="button button-outline" disabled={busy} onClick={() => signIn('GitHub')}>Continue with GitHub</button>}
      {providers.google && <button className="button button-outline" disabled={busy} onClick={() => signIn('Google')}>Continue with Google</button>}
      {providers.email && <><label className="setting-select">Email for magic link<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com"/></label><button className="button button-outline" disabled={busy || !email} onClick={() => run('Email', () => supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } }))}>Send magic link</button></>}
      {!providers.email && !providers.github && !providers.google && <p className="small-meta">Sign-in providers are disabled.</p>}
    </> : <>
      <p className="small-meta" data-testid="signed-in-account">Signed in as {user.email || user.user_metadata?.name || user.id}</p>
      <button className="button button-yellow" disabled={busy} onClick={() => run('Save', async () => { const { error } = await supabase.from('saved_games').insert({ name: `Game ${new Date().toLocaleString()}`, fen, pgn }); if (error) throw error; const { data, error: readError } = await supabase.from('saved_games').select('id,name,fen,pgn,updated_at').order('updated_at', { ascending: false }); if (readError) throw readError; setSaves(data || []); setMessage('Game saved to your account.'); return {}; })}>Save current game</button>
      <div className="cloud-save-list">{saves.map((save) => <button className="button button-outline" key={save.id} onClick={() => onLoad(save)}>{save.name} · {new Date(save.updated_at).toLocaleDateString()}</button>)}</div>
      <button className="button button-outline" disabled={busy} onClick={() => run('Sign out', () => supabase.auth.signOut())}>Sign out</button>
    </>}
    {message && <p className="small-meta" role="status">{message}</p>}
  </section>;
}
