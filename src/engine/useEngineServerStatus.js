import { useEffect, useState } from 'react';

const apiUrl = (import.meta.env.VITE_ENGINE_API_URL || '').replace(/\/+$/, '');
const enabled = Boolean(apiUrl) && import.meta.env.VITE_ENGINE_SERVER_ENABLED !== 'false';

export function useEngineServerStatus() {
  const [status, setStatus] = useState({ state: enabled ? 'offline' : 'browser', engine: '', threads: null, responseTimeMs: null });
  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    let timer;
    let controller;
    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      controller = new AbortController();
      const start = performance.now();
      try {
        const response = await fetch(`${apiUrl}/health`, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json();
        if (body?.ok !== true) throw new Error('Invalid health response');
        if (active) setStatus({ state: 'online', engine: body.engine, threads: body.threads, responseTimeMs: Math.round(performance.now() - start) });
      } catch {
        if (active) setStatus((previous) => ({ ...previous, state: 'offline', responseTimeMs: Math.round(performance.now() - start) }));
      } finally {
        if (active) timer = window.setTimeout(poll, 60_000);
      }
    };
    const visibility = () => { if (document.visibilityState === 'visible') { window.clearTimeout(timer); poll(); } else { window.clearTimeout(timer); controller?.abort(); } };
    const usage = (event) => { if (active) setStatus((previous) => ({ ...previous, state: event.detail === 'browser' ? 'browser' : 'online' })); };
    poll();
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('chessflow-engine-use', usage);
    return () => { active = false; window.clearTimeout(timer); controller?.abort(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('chessflow-engine-use', usage); };
  }, []);
  return status;
}

export const engineServerEnabled = enabled;
export function reportEngineUse(engine) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('chessflow-engine-use', { detail: engine }));
}
