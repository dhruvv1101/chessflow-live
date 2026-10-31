const FULL_SINGLE = 'stockfish-19-single';
const FULL_MULTI = 'stockfish-19';
const LITE_SINGLE = 'stockfish-19-lite-single';

export function engineAssetSet(kind, isolated = globalThis.crossOriginIsolated === true) {
  if (kind === 'full') {
    const base = isolated ? FULL_MULTI : FULL_SINGLE;
    return { js: `/engine/${base}.js`, wasm: `/engine/${base}.wasm`, build: isolated ? 'Full multi-thread' : 'Full single-thread', threads: isolated ? Math.max(1, Math.min(4, globalThis.navigator?.hardwareConcurrency || 2)) : 1 };
  }
  return { js: `/engine/${LITE_SINGLE}.js`, wasm: `/engine/${LITE_SINGLE}.wasm`, build: 'Lite single-thread', threads: 1 };
}

export async function preloadEngineAssets(assets, onProgress = () => {}, fetchImpl = globalThis.fetch) {
  const urls = [assets.js, assets.wasm];
  const expected = assets.wasm.includes('lite') ? [30000, 1_845_971] : assets.wasm.endsWith('stockfish-19.wasm') ? [33326, 99_076_105] : [28130, 99_169_054];
  let loaded = 0;
  for (let index = 0; index < urls.length; index += 1) {
    const response = await fetchImpl(urls[index], { cache: 'force-cache' });
    if (!response.ok) throw new Error(`Could not load Stockfish asset (${response.status}): ${urls[index]}`);
    const reader = response.body?.getReader();
    if (!reader) {
      await response.arrayBuffer(); loaded += expected[index]; onProgress(Math.round(loaded * 100 / expected.reduce((a, b) => a + b, 0))); continue;
    }
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      loaded += value.byteLength;
      onProgress(Math.min(99, Math.round(loaded * 100 / expected.reduce((a, b) => a + b, 0))));
    }
  }
  onProgress(100);
}
