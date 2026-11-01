export const SETTINGS_KEY = 'chessflow-live.settings.v1';
export const SETTINGS_VERSION = 1;

export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'system',
  boardColor: 'purple',
  reduceMotion: false,
  showLegalDots: true,
  highlightLastMove: true,
  flipBoard: false,
  showCoordinates: true,
  showBestMoveArrow: true,
  showOpponentThreats: false,
  showTacticalArrows: false,
  hintTime: 4000,
  engineChoice: 'standard',
  hintEngine: 'auto',
  defaultDifficulty: 'Medium',
  localOrientation: 'fixed',
  localHintsAllowed: true,
  classificationThresholds: Object.freeze({ best: 10, excellent: 30, good: 60, inaccuracy: 100, mistake: 200 }),
});

const themeValues = new Set(['system', 'light', 'dark']);
const boardValues = new Set(['purple', 'green', 'slate']);
const hintTimes = new Set([2000, 4000, 6000]);
const difficulties = new Set(['Easy', 'Medium', 'Hard', 'Max']);
const engineChoices = new Set(['standard', 'strong']);
const hintEngines = new Set(['auto', 'server', 'browser']);

function getStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

export function validateSettings(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const thresholdInput = source.classificationThresholds && typeof source.classificationThresholds === 'object' ? source.classificationThresholds : {};
  const thresholds = {};
  let previous = 0;
  for (const key of ['best', 'excellent', 'good', 'inaccuracy', 'mistake']) {
    const configured = Number(thresholdInput[key]);
    const fallback = DEFAULT_SETTINGS.classificationThresholds[key];
    thresholds[key] = Math.max(previous, Math.min(2000, Number.isFinite(configured) ? configured : fallback));
    previous = thresholds[key];
  }
  return {
    theme: themeValues.has(source.theme) ? source.theme : DEFAULT_SETTINGS.theme,
    boardColor: boardValues.has(source.boardColor) ? source.boardColor : DEFAULT_SETTINGS.boardColor,
    reduceMotion: typeof source.reduceMotion === 'boolean' ? source.reduceMotion : DEFAULT_SETTINGS.reduceMotion,
    showLegalDots: typeof source.showLegalDots === 'boolean' ? source.showLegalDots : DEFAULT_SETTINGS.showLegalDots,
    highlightLastMove: typeof source.highlightLastMove === 'boolean' ? source.highlightLastMove : DEFAULT_SETTINGS.highlightLastMove,
    flipBoard: typeof source.flipBoard === 'boolean' ? source.flipBoard : DEFAULT_SETTINGS.flipBoard,
    showCoordinates: typeof source.showCoordinates === 'boolean' ? source.showCoordinates : DEFAULT_SETTINGS.showCoordinates,
    showBestMoveArrow: typeof source.showBestMoveArrow === 'boolean' ? source.showBestMoveArrow : DEFAULT_SETTINGS.showBestMoveArrow,
    showOpponentThreats: typeof source.showOpponentThreats === 'boolean' ? source.showOpponentThreats : DEFAULT_SETTINGS.showOpponentThreats,
    showTacticalArrows: typeof source.showTacticalArrows === 'boolean' ? source.showTacticalArrows : DEFAULT_SETTINGS.showTacticalArrows,
    hintTime: hintTimes.has(source.hintTime) ? source.hintTime : DEFAULT_SETTINGS.hintTime,
    engineChoice: engineChoices.has(source.engineChoice) ? source.engineChoice : DEFAULT_SETTINGS.engineChoice,
    hintEngine: hintEngines.has(source.hintEngine) ? source.hintEngine : DEFAULT_SETTINGS.hintEngine,
    defaultDifficulty: difficulties.has(source.defaultDifficulty) ? source.defaultDifficulty : DEFAULT_SETTINGS.defaultDifficulty,
    localOrientation: source.localOrientation === 'auto' ? 'auto' : 'fixed',
    localHintsAllowed: typeof source.localHintsAllowed === 'boolean' ? source.localHintsAllowed : DEFAULT_SETTINGS.localHintsAllowed,
    classificationThresholds: thresholds,
  };
}

function writeSettings(settings, storage) {
  try { storage?.setItem(SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION, settings })); } catch { /* storage can be blocked or full */ }
}

export function loadSettings(storage = getStorage()) {
  try {
    const serialized = storage?.getItem(SETTINGS_KEY);
    if (!serialized) return { ...DEFAULT_SETTINGS };
    const saved = JSON.parse(serialized);
    if (saved?.version === SETTINGS_VERSION) return validateSettings(saved.settings);
    if (saved?.version === 0 && saved.settings && typeof saved.settings === 'object') {
      const prior = saved.settings;
      const migrated = validateSettings({ ...prior, hintTime: Number(prior.hintSeconds) * 1000 });
      writeSettings(migrated, storage);
      return migrated;
    }
  } catch { /* malformed or inaccessible storage uses defaults */ }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings, storage = getStorage()) {
  const validated = validateSettings(settings);
  writeSettings(validated, storage);
  return validated;
}

export function resetSettings(storage = getStorage()) {
  return saveSettings(DEFAULT_SETTINGS, storage);
}
