import { analyzeRemote } from './remoteEngine.js';

export async function analyzeWithRouter({ fen, options, purpose, hintEngine = 'auto', positionId,
  getPositionId, browserAnalyze, onFallback, remoteAnalyze = analyzeRemote }) {
  const serverConfigured = Boolean(import.meta.env.VITE_ENGINE_API_URL);
  const eligible = purpose === 'hint' || purpose === 'review';
  if (!eligible || hintEngine === 'browser' || (!serverConfigured && hintEngine === 'auto')) return browserAnalyze();
  try {
    return await remoteAnalyze(fen, { ...options, positionId, getPositionId });
  } catch (error) {
    if (error.name === 'AbortError' && getPositionId?.() !== positionId) throw error;
    onFallback?.(error);
    const result = await browserAnalyze();
    return { ...result, engineInfo: { ...result.engineInfo, source: 'Using browser engine', fallbackReason: error.message } };
  }
}
