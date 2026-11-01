import { useEffect, useState } from 'react';
import { supabase } from './cloud/supabase.js';
import { listLocalSaves, saveLocalGame } from './cloud/savedGames.js';

export default function CloudSavesPanel({ fen, pgn, onLoad }) {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [saves, setSaves] = useState([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!supabase) return undefined;
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!supabase) { listLocalSaves().then(setSaves); return; }
    if (!user) { setSaves([]); return; }
    supabase.from('saved_games').select('id,name,fen,pgn,updated_at').order('updated_at', { ascending: false }).then(({ data, error }) => {
      if (error) setMessage(error.message); else setSaves(data || []);
    });
  }, [user]);
  const run = async (action) => {
    setBusy(true); setMessage('');
    try { await action(); } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  if (!supabase) return <section className="settings-section" aria-labelledby="cloud-saves-title">
    <h3 id="cloud-saves-title">Saved games</h3><p className="small-meta">Saved locally in this browser with IndexedDB. Configure Supabase to sync across devices.</p>
    <button className="button button-yellow" disabled={busy} onClick={() => run(async () => { await saveLocalGame({ name: `Game ${new Date().toLocaleString()}`, fen, pgn }); setSaves(await listLocalSaves()); setMessage('Game saved in this browser.'); })}>Save current game locally</button>
    <div className="cloud-save-list">{saves.map((save) => <button className="button button-outline" key={save.id} onClick={() => onLoad(save)}>{save.name} · {new Date(save.updated_at).toLocaleDateString()}</button>)}</div>
    {message && <p className="small-meta" role="status">{message}</p>}
  </section>;
  return <section className="settings-section" aria-labelledby="cloud-saves-title">
    <h3 id="cloud-saves-title">Cloud saves</h3>
    {!user ? <><label className="setting-select">Email for magic link<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com"/></label><button className="button button-outline" disabled={busy || !email} onClick={() => run(async () => { const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } }); if (error) throw error; setMessage('Magic link sent. Check your email.'); })}>Send magic link</button><button className="button button-outline" disabled={busy} onClick={() => run(async () => { const { error } = await supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: window.location.origin } }); if (error) throw error; })}>Continue with GitHub</button></> : <><p className="small-meta">Signed in as {user.email}</p><button className="button button-yellow" disabled={busy} onClick={() => run(async () => { const { error } = await supabase.from('saved_games').insert({ name: `Game ${new Date().toLocaleString()}`, fen, pgn }); if (error) throw error; const { data, error: readError } = await supabase.from('saved_games').select('id,name,fen,pgn,updated_at').order('updated_at', { ascending: false }); if (readError) throw readError; setSaves(data || []); setMessage('Game saved to your account.'); })}>Save current game</button><div className="cloud-save-list">{saves.map((save) => <button className="button button-outline" key={save.id} onClick={() => onLoad(save)}>{save.name} · {new Date(save.updated_at).toLocaleDateString()}</button>)}</div><button className="button button-outline" disabled={busy} onClick={() => run(async () => { const { error } = await supabase.auth.signOut(); if (error) throw error; })}>Sign out</button></>}
    {message && <p className="small-meta" role="status">{message}</p>}
  </section>;
}
