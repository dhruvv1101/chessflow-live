import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { DIFFICULTIES, ENGINE } from './config.js';
import { Engine } from './engine.js';
import { engineAssetSet, preloadEngineAssets } from './engineAssets.js';
import { analyzeWithRouter } from './engine/engineRouter.js';
import { reportEngineUse, useEngineServerStatus } from './engine/useEngineServerStatus.js';
import { formatEvaluation, getGameStatus, getMoveList, makeLegalMove } from './game.js';
import DashboardLayout from './DashboardLayout.jsx';
import { CHESS_PIECES } from './pieces.jsx';
import { DEFAULT_SETTINGS, loadSettings, resetSettings as resetSavedSettings, saveSettings } from './settings.js';
import { DEFAULT_LOCAL_OPTIONS, LOCAL_GAME_VERSION, addClockIncrement, clearLocalGame, isCurrentHintResult, localClockStart, readLocalGame, resolveDrawOffer, restoreChess, restoreClockAfterUndo, tickClock, writeLocalGame } from './localGame.js';
import { buildTimeline, calculateEvaluationLoss, classifyMove, legalVariation, scoreToWhiteCp } from './analysis.js';
import { analyzeCoachMove, cacheCoachExplanation, coachCacheKey, getCachedCoachExplanation } from './engine/coach.js';
import { recordTrainingGame } from './training.js';

const initialGame = () => new Chess();
const sideName = (color) => color === 'w' ? 'White' : 'Black';

function App() {
  const engineServerStatus = useEngineServerStatus();
  const chessRef = useRef(initialGame());
  const engineRefs = useRef({ play: null, hint: null });
  const moveListRef = useRef(null);
  const [settings, setSettings] = useState(() => loadSettings());
  const [fen, setFen] = useState(chessRef.current.fen());
  const [human, setHuman] = useState('w');
  const [sideChoice, setSideChoice] = useState('w');
  const [difficulty, setDifficulty] = useState(() => loadSettings().defaultDifficulty);
  const [gameVersion, setGameVersion] = useState(0);
  const [engineState, setEngineState] = useState('idle');
  const [engineError, setEngineError] = useState('');
  const [engineProgress, setEngineProgress] = useState(0);
  const [thinking, setThinking] = useState(false);
  const [hints, setHints] = useState({ w: null, b: null });
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [dragState, setDragState] = useState(null);
  const dragRef = useRef(null);
  const [keyboardSquare, setKeyboardSquare] = useState('e2');
  const [promotion, setPromotion] = useState(null);
  const [notice, setNotice] = useState('Choose a side and start a new game.');
  const [resigned, setResigned] = useState(false);
  const [pgn, setPgn] = useState('');
  const [reviewRows, setReviewRows] = useState([]);
  const [reviewState, setReviewState] = useState('idle');
  const [reviewProgress, setReviewProgress] = useState('');
  const [reviewTimeline, setReviewTimeline] = useState(null);
  const [selectedPly, setSelectedPly] = useState(null);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [coach, setCoach] = useState({ state: 'idle', explanation: null, error: '' });
  const [practiceSession, setPracticeSession] = useState(null);
  const [mode, setMode] = useState('ai');
  const [localOutcome, setLocalOutcome] = useState('');
  const [localSession, setLocalSession] = useState(null);
  const localSessionRef = useRef(null);
  const [savedLocalGame, setSavedLocalGame] = useState(() => readLocalGame());
  const [hintLoading, setHintLoading] = useState(false);
  const positionIdRef = useRef(0);
  const navigationRequestRef = useRef(0);
  const reviewRunRef = useRef(0);
  const startFenRef = useRef(initialGame().fen());
  const [clockPulse, setClockPulse] = useState(0);
  const lastClockTickRef = useRef(Date.now());

  const chess = chessRef.current;
  const status = getGameStatus(chess);
  const sideToMove = chess.turn();
  const controllerColor = practiceSession?.color || (mode === 'local' ? sideToMove : human);
  const isPlayerTurn = Boolean(practiceSession) || mode === 'local' || sideToMove === human;
  const config = DIFFICULTIES[difficulty];
  const gameOver = status.kind === 'checkmate' || status.kind === 'stalemate' || status.kind === 'draw' || resigned;
  const moves = useMemo(() => getMoveList(chess), [fen]);
  const timeline = useMemo(() => reviewTimeline || buildTimeline(startFenRef.current, chess.history()), [fen, gameVersion, reviewTimeline]);
  const activePly = Math.max(0, Math.min(timeline.moves.length, selectedPly ?? timeline.moves.length));
  const boardFen = practiceSession?.fen || timeline.fens[activePly] || fen;
  const displayChess = useMemo(() => new Chess(boardFen), [boardFen]);
  const displayStatus = getGameStatus(displayChess);
  const displaySideToMove = displayChess.turn();
  const isReviewTimeline = Boolean(reviewTimeline);
  const isViewingHistory = !practiceSession && (isReviewTimeline || selectedPly !== null);
  const currentDisplayFenRef = useRef(boardFen);
  currentDisplayFenRef.current = boardFen;

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply = () => {
      root.dataset.theme = settings.theme;
      root.dataset.effectiveTheme = settings.theme === 'dark' || (settings.theme === 'system' && media?.matches) ? 'dark' : 'light';
      root.dataset.reduceMotion = String(settings.reduceMotion);
    };
    apply();
    media?.addEventListener?.('change', apply);
    return () => media?.removeEventListener?.('change', apply);
  }, [settings.theme, settings.reduceMotion]);

  const changeSettings = (patch) => {
    const next = saveSettings({ ...settings, ...patch });
    setSettings(next);
    if (Object.hasOwn(patch, 'defaultDifficulty')) setDifficulty(next.defaultDifficulty);
  };

  const resetSettings = () => {
    const next = resetSavedSettings();
    setSettings(next);
    setDifficulty(DEFAULT_SETTINGS.defaultDifficulty);
  };

  const loadCloudGame = (game) => {
    try {
      reviewRunRef.current += 1;
      const restored = new Chess(game.fen);
      chessRef.current = restored;
      startFenRef.current = restored.fen();
      setReviewTimeline(null); setSelectedPly(null); setReplayPlaying(false);
      setPgn(game.pgn || '');
      setMode('ai');
      setResigned(false);
      setLocalOutcome('');
      publishPosition();
      setNotice(`Loaded cloud game: ${game.name}.`);
    } catch (error) { setNotice(`Could not load cloud game: ${error.message}`); }
  };

  const resetBoardInteraction = useCallback((clearSelection = true) => {
    const active = dragRef.current;
    dragRef.current = null;
    if (active?.element?.hasPointerCapture?.(active.pointerId)) {
      try { active.element.releasePointerCapture(active.pointerId); } catch { /* capture may already have ended */ }
    }
    setDragState(null);
    if (clearSelection) setSelectedSquare(null);
  }, []);

  const publishPosition = useCallback(() => {
    positionIdRef.current += 1;
    navigationRequestRef.current += 1;
    setPracticeSession(null);
    Object.values(engineRefs.current).forEach((engine) => engine?.cancel());
    const nextFen = chessRef.current.fen();
    setSelectedPly(null); setReplayPlaying(false);
    setFen(nextFen);
    resetBoardInteraction();
    setPromotion(null);
    setHints({ w: null, b: null });
  }, [resetBoardInteraction]);

  const getEngine = useCallback(async (purpose = 'play') => {
    const slot = purpose === 'play' ? 'play' : 'hint';
    const kind = purpose === 'play' && settings.engineChoice !== 'strong' ? 'lite' : 'full';
    const assets = engineAssetSet(kind);
    if (!engineRefs.current[slot] || engineRefs.current[slot].closed || engineRefs.current[slot].workerUrl !== assets.js) {
      engineRefs.current[slot]?.dispose();
      setEngineState('loading'); setEngineError('');
      let instance;
      try {
        if (kind === 'full') await preloadEngineAssets(assets, setEngineProgress);
        instance = new Engine(assets.js, { build: assets.build, threads: assets.threads });
        engineRefs.current[slot] = instance;
        await instance.ready;
      } catch (error) {
        instance?.dispose();
        if (kind !== 'full') throw error;
        setEngineError(`Full engine could not start. Using browser Lite engine: ${error.message}`);
        const lite = engineAssetSet('lite');
        instance = new Engine(lite.js, { build: lite.build, threads: lite.threads });
        engineRefs.current[slot] = instance;
        await instance.ready;
      }
      setEngineState('ready'); setEngineProgress(100);
    }
    return engineRefs.current[slot];
  }, [settings.engineChoice]);

  const search = useCallback(async (position, options, purpose = 'play', searchId = positionIdRef.current) => {
    setEngineError('');
    setEngineState('loading');
    const browserAnalyze = async () => {
      const engine = await getEngine(purpose);
      setEngineState('loading');
      const result = await engine.analyze(position, options);
      setEngineState('ready');
      return result;
    };
    try {
      const result = await analyzeWithRouter({ fen: position, options, purpose, hintEngine: settings.hintEngine,
        positionId: searchId, getPositionId: () => positionIdRef.current, browserAnalyze,
        onFallback: (error) => { reportEngineUse('browser'); setNotice(`Server engine unavailable (${error.message}). Using browser engine.`); } });
      reportEngineUse(result.engineInfo?.source === 'Server engine' ? 'server' : 'browser');
      if (result.engineInfo?.source === 'Server engine') setEngineState('ready');
      return result;
    } catch (error) {
      if (error.name !== 'AbortError') {
        setEngineState(error.message.toLowerCase().includes('timed out') ? 'timeout' : 'failed');
        setEngineError(error.message);
      }
      throw error;
    }
  }, [getEngine, settings.hintEngine]);

  const navigateToPly = useCallback((ply) => {
    setReplayPlaying(false);
    setPracticeSession(null);
    const target = Math.max(0, Math.min(timeline.moves.length, ply));
    setSelectedPly(!reviewTimeline && target === timeline.moves.length ? null : target);
  }, [reviewTimeline, timeline.moves.length]);

  const toggleReplay = useCallback(() => {
    if (!timeline.moves.length) return;
    if (activePly >= timeline.moves.length) setSelectedPly(0);
    setReplayPlaying((playing) => !playing);
  }, [activePly, timeline.moves.length]);

  useEffect(() => {
    if (!replayPlaying) return undefined;
    const timer = window.setInterval(() => {
      setSelectedPly((ply) => {
        const current = ply ?? timeline.moves.length;
        if (current >= timeline.moves.length) { setReplayPlaying(false); return current; }
        const next = current + 1;
        if (next >= timeline.moves.length) {
          setReplayPlaying(false);
          return !reviewTimeline ? null : next;
        }
        return next;
      });
    }, 900);
    return () => window.clearInterval(timer);
  }, [replayPlaying, reviewTimeline, timeline.moves.length]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      if (document.querySelector('dialog[open]') || target?.closest?.('input, textarea, select, button, [contenteditable="true"], dialog[open]')) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); navigateToPly(activePly - 1); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); navigateToPly(activePly + 1); }
      else if (event.code === 'Space') { event.preventDefault(); toggleReplay(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activePly, navigateToPly, toggleReplay]);

  useEffect(() => {
    if (!isViewingHistory || reviewState === 'reviewing') return undefined;
    const requestId = ++navigationRequestRef.current;
    const color = displaySideToMove;
    let cancelled = false;
    search(boardFen, { movetime: settings.hintTime, skill: 20, multipv: ENGINE.multiPv, color }, 'navigation')
      .then((result) => {
        if (cancelled || requestId !== navigationRequestRef.current || currentDisplayFenRef.current !== boardFen) return;
        setHints((current) => ({ ...current, [color]: { ...result, fen: boardFen } }));
      })
      .catch((error) => { if (!cancelled && error.name !== 'AbortError') setNotice(`Position analysis unavailable: ${error.message}`); });
    return () => { cancelled = true; };
  }, [boardFen, displaySideToMove, isViewingHistory, reviewState, search, settings.hintTime]);

  const selectedReviewRow = reviewRows.find((row) => row.ply === activePly) || null;
  const startPractice = useCallback((row) => {
    if (!row?.previousFen || !row?.bestUci) return;
    setPracticeSession({ fen: row.previousFen, bestUci: row.bestUci, bestSan: row.bestSan, color: row.color });
    setSelectedPly(Math.max(0, row.ply - 1));
    setNotice(`Practice position: find Stockfish's best move for ${row.color === 'w' ? 'White' : 'Black'}.`);
  }, []);
  const explainMove = useCallback(async (row, signal) => {
    if (!row?.coachInput) return;
    const key = coachCacheKey(row.coachInput, 'Stockfish 19', { movetime: settings.hintTime, hashMb: ENGINE.hashMb });
    const cached = getCachedCoachExplanation(key);
    if (cached) { setCoach({ state: 'ready', explanation: cached, error: '' }); return; }
    setCoach({ state: 'loading', explanation: null, error: '' });
    try {
      const result = await analyzeCoachMove(row.coachInput, { signal });
      cacheCoachExplanation(key, result.explanation);
      setCoach({ state: 'ready', explanation: result.explanation, error: '' });
    } catch (error) {
      if (error.name !== 'AbortError') setCoach({ state: 'unavailable', explanation: null, error: error.message });
    }
  }, [settings.hintTime]);

  const onShowBetterMove = useCallback((row) => {
    if (!row?.previousFen || !row.bestUci) return;
    setPracticeSession({ fen: row.previousFen, bestUci: row.bestUci, bestSan: row.bestSan, color: row.color, showBest: true });
    setSelectedPly(Math.max(0, row.ply - 1));
    setNotice(`Best move: ${row.bestSan}. The board now shows the position before this move.`);
  }, []);
  const onShowOpponentPlan = useCallback((row) => {
    if (!row?.opponentSan || row.opponentSan === '—') return;
    setNotice(`Stockfish's top reply after ${row.san} is ${row.opponentSan}. See the verified line in the analysis panel.`);
  }, []);

  useEffect(() => {
    setCoach({ state: 'idle', explanation: null, error: '' });
    if (!selectedReviewRow || !['Inaccuracy', 'Mistake', 'Blunder'].includes(selectedReviewRow.label)) return undefined;
    const controller = new AbortController();
    void explainMove(selectedReviewRow, controller.signal);
    return () => controller.abort();
  }, [selectedReviewRow, explainMove]);

  useEffect(() => {
    const active = chessRef.current;
    if (mode === 'local' || gameOver || sideToMove === human || reviewState !== 'idle') return undefined;
    let cancelled = false;
    const searchFen = active.fen();
    setThinking(true);
    setNotice('Stockfish is thinking…');
    search(searchFen, { ...config, multipv: 1, color: active.turn() }, 'play')
      .then(({ best, lines }) => {
        if (cancelled) return;
        if (!best || best === '(none)' || !lines.length) throw new Error('Stockfish returned no legal move.');
        const played = makeLegalMove(chessRef.current, best);
        if (!played) throw new Error(`Stockfish returned an illegal move (${best}).`);
        publishPosition();
        setHints((current) => ({ ...current, [played.color]: { lines, best, fen: searchFen } }));
        setNotice(`Stockfish played ${played.san}.`);
      })
      .catch((error) => {
        if (!cancelled && error.name !== 'AbortError') setNotice(`Engine unavailable: ${error.message}`);
      })
      .finally(() => { if (!cancelled) setThinking(false); });
    return () => { cancelled = true; };
  }, [fen, human, gameOver, gameVersion, reviewState, config, search, publishPosition, sideToMove, mode]);

  useEffect(() => {
    if (moveListRef.current) moveListRef.current.scrollTop = moveListRef.current.scrollHeight;
  }, [moves]);

  useEffect(() => () => Object.values(engineRefs.current).forEach((engine) => engine?.dispose()), []);

  const startGame = (choice = sideChoice) => {
    reviewRunRef.current += 1;
    clearLocalGame();
    setSavedLocalGame(null);
    setLocalSession(null); localSessionRef.current = null; setMode('ai');
    Object.values(engineRefs.current).forEach((engine) => engine?.cancel());
    chessRef.current = initialGame();
    startFenRef.current = chessRef.current.fen();
    setReviewTimeline(null); setSelectedPly(null); setReplayPlaying(false); setCoach({ state: 'idle', explanation: null, error: '' });
    setPracticeSession(null);
    setSideChoice(choice);
    setHuman(choice === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : choice);
    setResigned(false);
    setLocalOutcome('');
    setThinking(false);
    setReviewRows([]);
    setReviewState('idle');
    setGameVersion((value) => value + 1);
    publishPosition();
    setNotice(choice === 'random' ? 'Random side selected. New game started.' : `New game started. You are ${sideName(choice)}.`);
  };

  const storeLocalSession = (next) => {
    localSessionRef.current = next;
    setLocalSession(next);
    writeLocalGame(next);
    setSavedLocalGame(next);
  };

  const makeLocalSnapshot = (game, options, clocks, hintCounts, clockHistory = []) => ({
    version: LOCAL_GAME_VERSION,
    sans: game.history(),
    fens: (() => { const replay = new Chess(); const result = [replay.fen()]; for (const san of game.history()) { replay.move(san); result.push(replay.fen()); } return result; })(),
    options, clocks, hintCounts, clockHistory,
  });

  const startLocalGame = (options = DEFAULT_LOCAL_OPTIONS) => {
    reviewRunRef.current += 1;
    Object.values(engineRefs.current).forEach((engine) => engine?.cancel());
    const whiteName = (options.whiteName || '').trim().slice(0, 16) || 'White';
    const blackName = (options.blackName || '').trim().slice(0, 16) || 'Black';
    const normalized = { ...DEFAULT_LOCAL_OPTIONS, ...options, whiteName, blackName };
    const initialClocks = localClockStart(normalized.clock);
    const initial = makeLocalSnapshot(initialGame(), normalized, { w: initialClocks.w, b: initialClocks.b }, { w: 0, b: 0 });
    chessRef.current = initialGame(); startFenRef.current = chessRef.current.fen(); setReviewTimeline(null); setSelectedPly(null); setReplayPlaying(false); setPracticeSession(null); setMode('local'); setLocalSession(initial); localSessionRef.current = initial;
    writeLocalGame(initial); setSavedLocalGame(initial); setHuman('w'); setSideChoice('w'); setResigned(false); setLocalOutcome(''); lastClockTickRef.current = Date.now();
    setThinking(false); setReviewRows([]); setReviewState('idle'); setHints({ w: null, b: null });
    setGameVersion((value) => value + 1); publishPosition();
    setNotice(`${whiteName} to move (White).`);
  };

  const resumeLocalGame = () => {
    reviewRunRef.current += 1;
    const stored = readLocalGame();
    if (!stored) { setSavedLocalGame(null); return; }
    Object.values(engineRefs.current).forEach((engine) => engine?.cancel()); chessRef.current = restoreChess(stored); startFenRef.current = new Chess().fen(); setReviewTimeline(null); setSelectedPly(null); setReplayPlaying(false); setPracticeSession(null); localSessionRef.current = stored;
    setLocalSession(stored); setMode('local'); setHuman('w'); setSideChoice('w'); setResigned(false);
    setLocalOutcome(''); lastClockTickRef.current = Date.now();
    setGameVersion((value) => value + 1); publishPosition(); setNotice('Two-player game resumed.');
  };

  useEffect(() => {
    const timer = window.setInterval(() => setClockPulse((value) => value + 1), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const now = Date.now(); const elapsed = now - lastClockTickRef.current; lastClockTickRef.current = now;
    if (mode !== 'local' || !localSession || localSession.options.clock === 'none' || gameOver || document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return;
    const side = chessRef.current.turn();
    const clocks = tickClock(localSession.clocks, side, elapsed);
    if (clocks[side] === localSession.clocks[side]) return;
    const next = { ...localSession, clocks };
    localSessionRef.current = next; setLocalSession(next); writeLocalGame(next); setSavedLocalGame(next);
    if (clocks[side] <= 0) {
      positionIdRef.current += 1; Object.values(engineRefs.current).forEach((engine) => engine?.cancel()); setHints({ w: null, b: null });
      const opponent = side === 'w' ? 'b' : 'w';
      const insufficient = chessRef.current.isInsufficientMaterial();
      setResigned(true);
      setLocalOutcome(insufficient ? 'flag-draw' : 'flag');
      setNotice(insufficient ? 'Draw: the opponent cannot checkmate with the remaining material.' : `${side === 'w' ? localSession.options.whiteName : localSession.options.blackName} flagged. ${opponent === 'w' ? localSession.options.whiteName : localSession.options.blackName} wins.`);
    }
  }, [clockPulse, mode, localSession, gameOver]);

  const chooseMove = (from, to) => {
    if (practiceSession) {
      const trial = new Chess(practiceSession.fen);
      const candidateMoves = trial.moves({ square: from, verbose: true }).filter((move) => move.to === to);
      if (!candidateMoves.length) return false;
      if (candidateMoves.some((move) => move.promotion)) { setPromotion({ from, to, color: practiceSession.color, practice: true }); return false; }
      const attempted = makeLegalMove(trial, { from, to });
      if (!attempted) return false;
      const uci = `${attempted.from}${attempted.to}${attempted.promotion || ''}`;
      if (uci === practiceSession.bestUci) { setPracticeSession(null); setSelectedPly(null); setNotice(`Correct: ${attempted.san} is the engine's best move.`); return true; }
      setNotice(`${attempted.san} is legal, but Stockfish prefers ${practiceSession.bestSan}. Try again.`);
      return false;
    }
    if (!from || !to || isViewingHistory || gameOver || (thinking && mode !== 'local') || !isPlayerTurn || reviewState === 'reviewing') return false;
    const candidates = chessRef.current.moves({ square: from, verbose: true }).filter((move) => move.to === to);
    if (!candidates.length) return false;
    if (candidates.some((move) => move.promotion)) {
      setPromotion({ from, to, color: chessRef.current.turn() });
      return false;
    }
    const beforeLocal = mode === 'local' ? localSessionRef.current : null;
    const move = makeLegalMove(chessRef.current, { from, to });
    if (!move) return false;
    if (mode === 'local' && localSessionRef.current) {
      const current = localSessionRef.current;
      const nextSide = chessRef.current.turn();
      const increment = current.options.clock === '15+10' ? 10_000 : 0;
      const clocks = addClockIncrement(current.clocks, move.color, increment);
      storeLocalSession(makeLocalSnapshot(chessRef.current, current.options, clocks, current.hintCounts, [...(current.clockHistory || []), beforeLocal.clocks]));
      lastClockTickRef.current = Date.now();
      setNotice(`${nextSide === 'w' ? current.options.whiteName : current.options.blackName} to move (${sideName(nextSide)}).`);
    }
    publishPosition();
    if (mode !== 'local') setNotice(statusText(getGameStatus(chessRef.current)));
    return true;
  };

  const squareAtPoint = (x, y) => document.elementFromPoint(x, y)?.closest('[data-square]')?.dataset.square ?? null;

  const onBoardPointerDown = (event) => {
    if (isViewingHistory || !event.isPrimary || event.button !== 0 || !isPlayerTurn || gameOver || (thinking && mode !== 'local') || reviewState === 'reviewing') return;
    const square = event.target.closest('[data-square]')?.dataset.square;
    if (!square) return;
    const interactionGame = practiceSession ? new Chess(practiceSession.fen) : chessRef.current;
    const clickedPiece = interactionGame.get(square);
    const sourceSquare = clickedPiece?.color === controllerColor ? square : selectedSquare;
    if (!sourceSquare) return;
    const piece = interactionGame.get(sourceSquare);
    if (!piece || piece.color !== controllerColor) return;
    event.preventDefault();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* pointer may be managed by the browser */ }
    const squareRect = event.currentTarget.querySelector(`[data-square="${square}"]`)?.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      element: event.currentTarget,
      sourceSquare,
      startSquare: square,
      pieceType: `${piece.color}${piece.type.toUpperCase()}`,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      size: squareRect?.width || 56,
    };
  };

  const onBoardPointerMove = (event) => {
    const active = dragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const moved = active.moved || Math.hypot(event.clientX - active.startX, event.clientY - active.startY) >= 6;
    active.moved = moved;
    if (moved) setDragState({ pieceType: active.pieceType, x: event.clientX, y: event.clientY, size: active.size });
  };

  const onBoardPointerUp = (event) => {
    const active = dragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const targetSquare = squareAtPoint(event.clientX, event.clientY);
    const wasDrag = active.moved;
    const from = active.sourceSquare;
    const previousSelection = selectedSquare;
    resetBoardInteraction(wasDrag || !targetSquare);
    if (wasDrag) {
      if (targetSquare && targetSquare !== from) chooseMove(from, targetSquare);
      setSelectedSquare(null);
      return;
    }
    if (!targetSquare) return;
    const targetPiece = (practiceSession ? new Chess(practiceSession.fen) : chessRef.current).get(targetSquare);
    if (targetPiece?.color === controllerColor) {
      setSelectedSquare(previousSelection === targetSquare ? null : targetSquare);
    } else if (previousSelection) {
      chooseMove(previousSelection, targetSquare);
    }
  };

  const onBoardPointerCancel = (event) => {
    if (dragRef.current?.pointerId === event.pointerId) resetBoardInteraction();
  };

  const onBoardMouseLeave = () => {
    if (dragRef.current) resetBoardInteraction();
    else setSelectedSquare(null);
  };

  const onBoardKeyDown = (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); event.stopPropagation();
      navigateToPly(activePly + (event.key === 'ArrowLeft' ? -1 : 1));
      return;
    }
    if (event.code === 'Space') { event.preventDefault(); event.stopPropagation(); toggleReplay(); return; }
    const file = keyboardSquare.charCodeAt(0) - 97;
    const rank = Number(keyboardSquare[1]);
    const forward = controllerColor === 'w' ? 1 : -1;
    const steps = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, forward], ArrowDown: [0, -forward] };
    if (steps[event.key]) {
      event.preventDefault();
      const [df, dr] = steps[event.key];
      setKeyboardSquare(`${String.fromCharCode(97 + Math.max(0, Math.min(7, file + df)))}${Math.max(1, Math.min(8, rank + dr))}`);
      return;
    }
    if (event.key === 'Escape') { resetBoardInteraction(); setPromotion(null); return; }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (selectedSquare) {
        if (!chooseMove(selectedSquare, keyboardSquare)) {
          if ((practiceSession ? new Chess(practiceSession.fen) : chessRef.current).get(keyboardSquare)?.color === controllerColor) setSelectedSquare(keyboardSquare);
        }
      } else if ((practiceSession ? new Chess(practiceSession.fen) : chessRef.current).get(keyboardSquare)?.color === controllerColor) setSelectedSquare(keyboardSquare);
    }
  };

  const promote = (piece) => {
    if (promotion?.practice && practiceSession) {
      const trial = new Chess(practiceSession.fen);
      const move = makeLegalMove(trial, { from: promotion.from, to: promotion.to, promotion: piece });
      if (move && `${move.from}${move.to}${move.promotion || ''}` === practiceSession.bestUci) {
        setPracticeSession(null); setSelectedPly(null); setNotice(`Correct: ${move.san} is the engine's best move.`);
      } else setNotice(`Try the engine's best move: ${practiceSession.bestSan}.`);
      setPromotion(null); return;
    }
    const move = makeLegalMove(chessRef.current, { from: promotion.from, to: promotion.to, promotion: piece });
    if (move) { publishPosition(); setNotice(statusText(getGameStatus(chessRef.current))); }
    setPromotion(null);
  };

  const requestHint = async () => {
    if ((!isViewingHistory && gameOver) || reviewState === 'reviewing') return;
    const searchPositionId = positionIdRef.current;
    const searchColor = displaySideToMove;
    const searchFen = boardFen;
    const requestId = navigationRequestRef.current;
    setHintLoading(true);
    setThinking(true);
    setNotice('Finding the top lines…');
    try {
      const result = await search(searchFen, { skill: 20, movetime: settings.hintTime, multipv: ENGINE.multiPv, color: searchColor }, 'hint', searchPositionId);
      if (!isCurrentHintResult(searchPositionId, positionIdRef.current)) return;
      if (currentDisplayFenRef.current !== searchFen || (isViewingHistory && requestId !== navigationRequestRef.current)) return;
      if (!result.lines?.length || !result.lines[0]?.pv?.length) throw new Error('Stockfish returned no hint lines. Try another search.');
      setHints((current) => ({ ...current, [searchColor]: { ...result, fen: searchFen } }));
      if (mode === 'local' && !isViewingHistory && localSessionRef.current) {
        const session = localSessionRef.current;
        const next = { ...session, hintCounts: { ...session.hintCounts, [searchColor]: session.hintCounts[searchColor] + 1 } };
        storeLocalSession(next);
      }
      setNotice('Hint ready. The board position did not change.');
    } catch (error) {
      if (error.name !== 'AbortError') setNotice(`Hint unavailable: ${error.message}`);
    } finally { setThinking(false); setHintLoading(false); }
  };

  const undo = () => {
    if (practiceSession) { setPracticeSession(null); setNotice('Practice challenge closed.'); return; }
    Object.values(engineRefs.current).forEach((engine) => engine?.cancel());
    const game = chessRef.current;
    if (game.history().length === 0) return;
    game.undo();
    if (mode !== 'local' && game.turn() !== human && game.history().length) game.undo();
    if (mode === 'local' && localSessionRef.current) {
      const current = localSessionRef.current;
      const starting = localClockStart(current.options.clock);
      const restored = restoreClockAfterUndo(current.clockHistory || [], { w: starting.w, b: starting.b });
      storeLocalSession(makeLocalSnapshot(game, current.options, restored.clocks, current.hintCounts, restored.history));
    }
    setThinking(false);
    setResigned(false);
    setLocalOutcome('');
    publishPosition();
    setNotice('Last turn undone.');
  };

  const importFinishedPgn = async () => {
    let parsed;
    try {
      parsed = new Chess();
      parsed.loadPgn(pgn);
      if (!parsed.history().length || !['1-0', '0-1', '1/2-1/2'].includes(parsed.header().Result)) throw new Error('Import a finished game with a recorded result (1-0, 0-1, or 1/2-1/2).');
    } catch (error) { setNotice(`PGN error: ${error.message}`); return; }
    const header = parsed.header();
    const history = parsed.history();
    let review;
    try { review = buildTimeline(header.FEN || new Chess().fen(), history); }
    catch (error) { setNotice(`PGN error: ${error.message}`); return; }
    positionIdRef.current += 1;
    navigationRequestRef.current += 1;
    const reviewRun = ++reviewRunRef.current;
    Object.values(engineRefs.current).forEach((engine) => engine?.cancel());
    setReviewTimeline(review);
    setSelectedPly(review.moves.length);
    setReplayPlaying(false);
    setReviewRows([]);
    setReviewState('reviewing');
    setResigned(false);
    setLocalOutcome('');
    setThinking(true);
    try {
      const results = [];
      for (let index = 0; index < history.length; index += 1) {
        const played = review.moves[index];
        const before = review.fens[index];
        const after = review.fens[index + 1];
        setReviewProgress(`Evaluating move ${index + 1} of ${history.length}`);
        const beforeEval = await search(before, { movetime: settings.hintTime, skill: 20, multipv: 3, color: before.split(' ')[1] }, 'navigation');
        if (reviewRun !== reviewRunRef.current) return;
        const afterEval = await search(after, { movetime: settings.hintTime, skill: 20, multipv: 3, color: after.split(' ')[1] }, 'navigation');
        if (reviewRun !== reviewRunRef.current) return;
        const best = beforeEval.lines?.[0];
        const playedPosition = afterEval.lines?.[0];
        const bestWhiteCp = scoreToWhiteCp(best);
        const playedWhiteCp = scoreToWhiteCp(playedPosition);
        const lossCp = calculateEvaluationLoss(bestWhiteCp, playedWhiteCp, played.color);
        const variations = (beforeEval.lines || []).slice(0, 3).map((line) => ({
          ...line, ...legalVariation(before, line.pv),
        })).filter((line) => line.uci.length);
        const response = afterEval.lines?.[0];
        const opponentResponse = response?.pv?.[0] || '';
        const punishmentVariations = (afterEval.lines || []).slice(0, 3).map((line) => ({
          ...line, ...legalVariation(after, line.pv),
        })).filter((line) => line.uci.length);
        const motifs = [];
        if (played.san.includes('+') || played.san.includes('#')) motifs.push(played.san.includes('#') ? 'checkmate' : 'check');
        if (played.captured) motifs.push('capture');
        const board = new Chess(before);
        const pieces = board.board().flat().filter(Boolean);
        const phase = pieces.length > 24 ? 'opening' : pieces.length > 12 ? 'middlegame' : 'endgame';
        const coachInput = {
          fen: after, previousFen: before, moveSan: played.san, moveUci: played.uci,
          bestUci: best?.move || best?.pv?.[0] || played.uci,
          evaluationBefore: bestWhiteCp, evaluationAfter: playedWhiteCp, evaluationLoss: lossCp,
          variations: variations.map((line) => ({ uci: line.uci, san: line.san })),
          punishmentVariations: punishmentVariations.map((line) => ({ uci: line.uci, san: line.san })),
          opponentResponse, sideToMove: played.color, gamePhase: phase, motifs,
        };
        const row = { number: Math.floor(index / 2) + 1, ply: index + 1, color: played.color, san: played.san,
          uci: played.uci, fen: after, previousFen: before, eval: formatEvaluation(playedPosition || {}), lossCp,
          beforeEvalText: formatEvaluation(best || {}), bestWhiteCp, label: classifyMove({ lossCp, thresholds: settings.classificationThresholds }), bestUci: coachInput.bestUci,
          bestSan: legalVariation(before, [coachInput.bestUci], 1).san[0] || '—', variations,
          opponentResponse, opponentSan: legalVariation(after, [opponentResponse], 1).san[0] || '—', pv: response?.pv || [],
          punishmentSan: punishmentVariations[0]?.san || [],
          motifs, gamePhase: phase, coachInput, depth: Math.max(best?.depth || 0, playedPosition?.depth || 0) };
        results.push(row);
        setReviewRows([...results]);
      }
      if (reviewRun !== reviewRunRef.current) return;
      recordTrainingGame(results, pgn);
      setReviewState('done');
      setNotice(`Review complete: ${history.length} plies evaluated. Opening-book names are unavailable without an opening database.`);
    } catch (error) {
      if (reviewRun !== reviewRunRef.current) return;
      setReviewState('failed');
      setNotice(`Review stopped: ${error.message}`);
    } finally { if (reviewRun === reviewRunRef.current) { setThinking(false); setReviewProgress(''); } }
  };

  const darkEffective = settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  const markWidth = darkEffective ? 2 : 4;
  const selectedMark = darkEffective ? 'var(--yellow)' : 'var(--outline)';
  const hintMark = darkEffective ? 'var(--lime)' : 'var(--outline)';
  const checkMark = darkEffective ? 'var(--pink)' : 'var(--outline)';
  const lastMove = settings.highlightLastMove ? timeline.moves[activePly - 1] : null;
  const checkedKingSquare = displayStatus.kind === 'check'
    ? displayChess.board().map((row, rank) => row.map((piece, file) => piece?.type === 'k' && piece.color === displaySideToMove ? `${'abcdefgh'[file]}${8 - rank}` : null).find(Boolean)).find(Boolean)
    : null;
  const highlights = {};
  if (lastMove) {
    highlights[lastMove.from] = { backgroundColor: 'var(--last-move)' };
    highlights[lastMove.to] = { backgroundColor: 'var(--last-move)' };
  }
  if (selectedSquare) highlights[selectedSquare] = { backgroundColor: darkEffective ? 'rgb(255 196 0 / 18%)' : 'var(--yellow)', boxShadow: `inset 0 0 0 ${markWidth}px ${selectedMark}` };
  if (keyboardSquare) highlights[keyboardSquare] = { ...highlights[keyboardSquare], outline: `${darkEffective ? 2 : 3}px solid ${darkEffective ? 'var(--yellow)' : 'var(--outline)'}`, outlineOffset: darkEffective ? '-3px' : '-4px' };
  if (selectedSquare && settings.showLegalDots) {
    for (const move of displayChess.moves({ square: selectedSquare, verbose: true })) {
      const lightSquare = (move.to.charCodeAt(0) - 97 + Number(move.to[1])) % 2 === 0;
      const dotColor = darkEffective ? (lightSquare ? '%230A0A14' : '%23E9E7FF') : '%23000';
      const opacity = darkEffective && lightSquare ? ' fill-opacity=%22.68%22' : '';
      const dot = `url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ccircle cx=%2250%22 cy=%2250%22 r=%2210%22 fill=%22${dotColor}%22${opacity}/%3E%3C/svg%3E")`;
      highlights[move.to] = { backgroundImage: dot, backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundSize: '26% 26%' };
    }
  }
  const currentPositionHint = hints[displaySideToMove]?.fen === boardFen ? hints[displaySideToMove] : null;
  const bestHintMove = settings.showBestMoveArrow ? currentPositionHint?.lines?.[0]?.pv?.[0] : null;
  if (bestHintMove) for (const square of [bestHintMove.slice(0, 2), bestHintMove.slice(2, 4)]) {
    highlights[square] = { backgroundColor: 'var(--lime)', boxShadow: `inset 0 0 0 ${markWidth}px ${hintMark}` };
  }
  if (checkedKingSquare) highlights[checkedKingSquare] = { backgroundColor: 'var(--pink)', boxShadow: `inset 0 0 0 ${markWidth}px ${checkMark}` };

  const boardDarkColors = { purple: 'var(--board-purple)', green: 'var(--board-green)', slate: 'var(--board-slate)' };
  const whiteOrientation = mode === 'local'
    ? (localSession?.options.orientation === 'auto' ? displaySideToMove === 'w' : !settings.flipBoard)
    : (human === 'w') !== settings.flipBoard;

  const options = {
    position: boardFen,
    boardOrientation: whiteOrientation ? 'white' : 'black',
    pieces: CHESS_PIECES,
    showNotation: settings.showCoordinates,
    allowDragging: false,
    showAnimations: !settings.reduceMotion && !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    animationDurationInMs: 160,
    squareStyles: highlights,
    lightSquareStyle: { backgroundColor: 'var(--board-light)' },
    darkSquareStyle: { backgroundColor: boardDarkColors[settings.boardColor] },
    lightSquareNotationStyle: { color: '#000' },
    darkSquareNotationStyle: { color: darkEffective ? '#FBF8F2' : '#000' },
    alphaNotationStyle: { fontWeight: 800 },
    numericNotationStyle: { fontWeight: 800 },
    boardStyle: { borderRadius: 'var(--board-radius, 12px)', overflow: 'hidden' },
  };

  const boardArrows = [];
  if (settings.showBestMoveArrow && bestHintMove) boardArrows.push({ from: bestHintMove.slice(0, 2), to: bestHintMove.slice(2, 4), kind: 'best' });
  if (settings.showOpponentThreats && selectedReviewRow?.opponentResponse) boardArrows.push({ from: selectedReviewRow.opponentResponse.slice(0, 2), to: selectedReviewRow.opponentResponse.slice(2, 4), kind: 'threat' });
  if (settings.showTacticalArrows && selectedReviewRow?.opponentResponse) {
    const arrow = { from: selectedReviewRow.opponentResponse.slice(0, 2), to: selectedReviewRow.opponentResponse.slice(2, 4), kind: 'tactical' };
    if (!boardArrows.some((current) => current.from === arrow.from && current.to === arrow.to)) boardArrows.push(arrow);
  }
  if (practiceSession?.showBest && practiceSession.bestUci) {
    boardArrows.unshift({ from: practiceSession.bestUci.slice(0, 2), to: practiceSession.bestUci.slice(2, 4), kind: 'best' });
  }
  return <DashboardLayout
    chess={chess} fen={boardFen} human={human} sideChoice={sideChoice} difficulty={difficulty} config={config}
    engineState={engineState} engineError={engineError} thinking={thinking} hints={hints} promotion={promotion}
    notice={notice} resigned={resigned} pgn={pgn} setPgn={setPgn} reviewRows={reviewRows}
    reviewState={reviewState} reviewProgress={reviewProgress} status={isViewingHistory || practiceSession ? displayStatus : status} sideToMove={displaySideToMove}
    options={options} moveListRef={moveListRef} moves={moves} startGame={startGame} setDifficulty={setDifficulty}
    requestHint={requestHint} undo={undo} setResigned={setResigned} setNotice={setNotice}
    importFinishedPgn={importFinishedPgn} promote={promote} setPromotion={setPromotion}
    onBoardKeyDown={onBoardKeyDown} dragState={dragState}
    onBoardPointerDown={onBoardPointerDown} onBoardPointerMove={onBoardPointerMove}
    onBoardPointerUp={onBoardPointerUp} onBoardPointerCancel={onBoardPointerCancel} onBoardMouseLeave={onBoardMouseLeave}
    settings={settings} onSettingsChange={changeSettings} resetSettings={resetSettings}
    engineServerStatus={engineServerStatus}
    onLoadCloudGame={loadCloudGame}
    clearSavedGame={() => { startGame(); try { localStorage.removeItem('chessflow-live.saved-game.v1'); } catch { /* storage may be unavailable */ } }}
    mode={mode} localSession={localSession} savedLocalGame={savedLocalGame} startLocalGame={startLocalGame}
    bestHintMove={bestHintMove} whiteOrientation={whiteOrientation}
    timelineMoves={timeline.moves} currentPly={activePly} onNavigate={navigateToPly} replayPlaying={replayPlaying} onToggleReplay={toggleReplay} isViewingHistory={isViewingHistory}
    selectedReviewRow={selectedReviewRow} coach={coach} onExplainMove={() => selectedReviewRow && explainMove(selectedReviewRow)} onShowOpponentPlan={onShowOpponentPlan} onShowBetterMove={onShowBetterMove} onPracticeMistake={startPractice}
    practiceSession={practiceSession} boardArrows={boardArrows}
    resumeLocalGame={resumeLocalGame} hintLoading={hintLoading} engineProgress={engineProgress} onCancelHint={() => { positionIdRef.current += 1; Object.values(engineRefs.current).forEach((engine) => engine?.cancel()); setHints({ w: null, b: null }); setHintLoading(false); setThinking(false); setNotice('Hint search canceled.'); }}
    localOutcome={localOutcome}
    onResignLocal={() => { const who = window.prompt('Who resigns? Enter White or Black.'); if (!who) return; const color = who.trim().toLowerCase() === 'white' ? 'w' : who.trim().toLowerCase() === 'black' ? 'b' : null; if (!color) { setNotice('Enter White or Black to resign.'); return; } const name = color === 'w' ? localSession?.options.whiteName : localSession?.options.blackName; if (window.confirm(`${name} resigns? Confirm to end the game.`)) { positionIdRef.current += 1; Object.values(engineRefs.current).forEach((engine) => engine?.cancel()); setHints({ w: null, b: null }); setHintLoading(false); setResigned(true); setLocalOutcome('resign'); setNotice(`${name} resigned. ${color === 'w' ? localSession.options.blackName : localSession.options.whiteName} wins.`); } }}
    onOfferDraw={() => { const opponent = sideToMove === 'w' ? localSession?.options.blackName : localSession?.options.whiteName; const outcome = resolveDrawOffer(window.confirm(`Draw offered. ${opponent}, accept the draw?`)); if (outcome === 'draw') { positionIdRef.current += 1; Object.values(engineRefs.current).forEach((engine) => engine?.cancel()); setHints({ w: null, b: null }); setHintLoading(false); setResigned(true); setLocalOutcome('draw'); setNotice('Draw agreed by both players.'); } else setNotice('Draw offer declined.'); }}
  />;
}

function statusText(status) {
  if (status.kind === 'checkmate') return `Checkmate — ${status.winner} wins.`;
  if (status.kind === 'stalemate') return 'Stalemate — drawn game.';
  if (status.kind === 'draw') return `${status.reason} — drawn game.`;
  if (status.kind === 'check') return `${sideName(status.side)} is in check.`;
  return 'Game in progress.';
}

export default App;
