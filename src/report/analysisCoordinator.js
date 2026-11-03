let liveGameActive = false;
const listeners = new Set();

export function setLiveGameActive(active) {
  const next = Boolean(active);
  if (liveGameActive === next) return;
  liveGameActive = next;
  for (const listener of listeners) listener(liveGameActive);
}

export function subscribeLiveGameActive(listener) {
  listeners.add(listener);
  listener(liveGameActive);
  return () => listeners.delete(listener);
}
