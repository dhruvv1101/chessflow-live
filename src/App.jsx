import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { DIFFICULTIES, ENGINE } from './config.js';
import { Engine } from './engine.js';
import { engineAssetSet, preloadEngineAssets } from './engineAssets.js';
import { analyzeWithRouter } from './engine/engineRouter.js';
import { formatEvaluation, getGameStatus, getMoveList, makeLegalMove } from './game.js';
import DashboardLayout from './DashboardLayout.jsx';
import { CHESS_PIECES } from './pieces.jsx';
import { DEFAULT_SETTINGS, loadSettings, resetSettings as resetSavedSettings, saveSettings } from './settings.js';
import { DEFAULT_LOCAL_OPTIONS, LOCAL_GAME_VERSION, addClockIncrement, clearLocalGame, isCurrentHintResult, localClockStart, readLocalGame, resolveDrawOffer, restoreChess, restoreClockAfterUndo, tickClock, writeLocalGame } from './localGame.js';

const initialGame = () => new Chess();
const sideName = (color) => color === 'w' ? 'White' : 'Black';

function App() {
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
  const [mode, setMode] = useState('ai');
  const [localOutcome, setLocalOutcome] = useState('');
  const [localSession, setLocalSession] = useState(null);
  const localSessionRef = useRef(null);
  const [savedLocalGame, setSavedLocalGame] = useState(() => readLocalGame());
  const [hintLoading, setHintLoading] = useState(false);
  const positionIdRef = useRef(0);
  const [clockPulse, setClockPulse] = useState(0);
  const lastClockTickRef = useRef(Date.now());

  const chess = chessRef.current;
  const status = getGameStatus(chess);
  const sideToMove = chess.turn();
  const controllerColor = mode === 'local' ? sideToMove : human;
  const isPlayerTurn = mode === 'local' || sideToMove === human;
  const config = DIFFICULTIES[difficulty];
  const gameOver = status.kind === 'checkmate' || status.kind === 'stalemate' || status.kind === 'draw' || resigned;
  const moves = useMemo(() => getMoveList(chess), [fen]);

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
    Object.values(engineRefs.current).forEach((engine) => engine?.cancel());
    const nextFen = chessRef.current.fen();
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
        onFallback: (error) => { setNotice(`Server engine unavailable (${error.message}). Using browser engine.`); } });
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
    clearLocalGame();
    setSavedLocalGame(null);
    setLocalSession(null); localSessionRef.current = null; setMode('ai');
    Object.values(engineRefs.current).forEach((engine) => engine?.cancel());
    chessRef.current = initialGame();
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
    Object.values(engineRefs.current).forEach((engine) => engine?.cancel());
    const whiteName = (options.whiteName || '').trim().slice(0, 16) || 'White';
    const blackName = (options.blackName || '').trim().slice(0, 16) || 'Black';
    const normalized = { ...DEFAULT_LOCAL_OPTIONS, ...options, whiteName, blackName };
    const initialClocks = localClockStart(normalized.clock);
    const initial = makeLocalSnapshot(initialGame(), normalized, { w: initialClocks.w, b: initialClocks.b }, { w: 0, b: 0 });
    chessRef.current = initialGame(); setMode('local'); setLocalSession(initial); localSessionRef.current = initial;
    writeLocalGame(initial); setSavedLocalGame(initial); setHuman('w'); setSideChoice('w'); setResigned(false); setLocalOutcome(''); lastClockTickRef.current = Date.now();
    setThinking(false); setReviewRows([]); setReviewState('idle'); setHints({ w: null, b: null });
    setGameVersion((value) => value + 1); publishPosition();
    setNotice(`${whiteName} to move (White).`);
  };

  const resumeLocalGame = () => {
    const stored = readLocalGame();
    if (!stored) { setSavedLocalGame(null); return; }
    Object.values(engineRefs.current).forEach((engine) => engine?.cancel()); chessRef.current = restoreChess(stored); localSessionRef.current = stored;
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
    if (!from || !to || gameOver || (thinking && mode !== 'local') || !isPlayerTurn || reviewState === 'reviewing') return false;
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
    if (!event.isPrimary || event.button !== 0 || !isPlayerTurn || gameOver || (thinking && mode !== 'local') || reviewState === 'reviewing') return;
    const square = event.target.closest('[data-square]')?.dataset.square;
    if (!square) return;
    const clickedPiece = chessRef.current.get(square);
    const sourceSquare = clickedPiece?.color === controllerColor ? square : selectedSquare;
    if (!sourceSquare) return;
    const piece = chessRef.current.get(sourceSquare);
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
    const targetPiece = chessRef.current.get(targetSquare);
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
          if (chessRef.current.get(keyboardSquare)?.color === controllerColor) setSelectedSquare(keyboardSquare);
        }
      } else if (chessRef.current.get(keyboardSquare)?.color === controllerColor) setSelectedSquare(keyboardSquare);
    }
  };

  const promote = (piece) => {
    const move = makeLegalMove(chessRef.current, { from: promotion.from, to: promotion.to, promotion: piece });
    if (move) { publishPosition(); setNotice(statusText(getGameStatus(chessRef.current))); }
    setPromotion(null);
  };

  const requestHint = async () => {
    if (gameOver || reviewState === 'reviewing') return;
    const searchPositionId = positionIdRef.current;
    const searchColor = chessRef.current.turn();
    setHintLoading(true);
    setThinking(true);
    setNotice('Finding the top lines…');
    try {
      const searchFen = chessRef.current.fen();
      const result = await search(searchFen, { skill: 20, movetime: settings.hintTime, multipv: ENGINE.multiPv, color: searchColor }, 'hint', searchPositionId);
      if (!isCurrentHintResult(searchPositionId, positionIdRef.current)) return;
      if (!result.lines?.length || !result.lines[0]?.pv?.length) throw new Error('Stockfish returned no hint lines. Try another search.');
      setHints((current) => ({ ...current, [searchColor]: { ...result, fen: searchFen } }));
      if (mode === 'local' && localSessionRef.current) {
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
    const reviewGame = new Chess(header.FEN || undefined);
    const history = parsed.history({ verbose: true });
    setReviewRows([]);
    setReviewState('reviewing');
    setThinking(true);
    try {
      const results = [];
      for (let index = 0; index < history.length; index += 1) {
        const recorded = history[index];
        const before = reviewGame.fen();
        const played = makeLegalMove(reviewGame, { from: recorded.from, to: recorded.to, promotion: recorded.promotion });
        if (!played) throw new Error(`Could not replay move ${index + 1}.`);
        const after = reviewGame.fen();
        setReviewProgress(`Evaluating move ${index + 1} of ${history.length}`);
        const beforeEval = await search(before, { movetime: settings.hintTime, skill: 20, multipv: 1, color: before.split(' ')[1] }, 'review');
        const afterEval = await search(after, { movetime: settings.hintTime, skill: 20, multipv: 1, color: after.split(' ')[1] }, 'review');
        const b = beforeEval.lines[0];
        const a = afterEval.lines[0];
        const whiteBefore = b?.cp ?? (b?.mate != null ? Math.sign(b.mate) * 10000 : 0);
        const whiteAfter = a?.cp ?? (a?.mate != null ? Math.sign(a.mate) * 10000 : 0);
        const gain = (recorded.color === 'w' ? whiteAfter - whiteBefore : whiteBefore - whiteAfter) / 100;
        const label = gain <= -2 ? 'Blunder' : gain <= -1 ? 'Mistake' : gain <= -0.5 ? 'Inaccuracy' : '—';
        results.push({ number: index + 1, color: recorded.color, san: recorded.san, eval: formatEvaluation(a || {}), label });
        setReviewRows([...results]);
      }
      setReviewState('done');
      setNotice(`Review complete: ${history.length} moves evaluated.`);
    } catch (error) {
      setReviewState('failed');
      setNotice(`Review stopped: ${error.message}`);
    } finally { setThinking(false); setReviewProgress(''); }
  };

  const lastMove = settings.highlightLastMove ? chess.history({ verbose: true }).at(-1) : null;
  const checkedKingSquare = status.kind === 'check'
    ? chess.board().map((row, rank) => row.map((piece, file) => piece?.type === 'k' && piece.color === sideToMove ? `${'abcdefgh'[file]}${8 - rank}` : null).find(Boolean)).find(Boolean)
    : null;
  const highlights = {};
  if (lastMove) {
    highlights[lastMove.from] = { backgroundColor: 'var(--last-move)' };
    highlights[lastMove.to] = { backgroundColor: 'var(--last-move)' };
  }
  if (selectedSquare) highlights[selectedSquare] = { backgroundColor: 'var(--yellow)', boxShadow: 'inset 0 0 0 4px var(--outline)' };
  if (keyboardSquare) highlights[keyboardSquare] = { ...highlights[keyboardSquare], outline: '3px solid var(--outline)', outlineOffset: '-4px' };
  if (selectedSquare && settings.showLegalDots) {
    const dot = 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ccircle cx=%2250%22 cy=%2250%22 r=%2210%22 fill=%22%23000%22/%3E%3C/svg%3E")';
    for (const move of chess.moves({ square: selectedSquare, verbose: true })) {
      highlights[move.to] = { backgroundImage: dot, backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundSize: '26% 26%' };
    }
  }
  const bestHintMove = hints[sideToMove]?.lines?.[0]?.pv?.[0];
  if (bestHintMove) for (const square of [bestHintMove.slice(0, 2), bestHintMove.slice(2, 4)]) {
    highlights[square] = { backgroundColor: 'var(--lime)', boxShadow: 'inset 0 0 0 4px var(--outline)' };
  }
  if (checkedKingSquare) highlights[checkedKingSquare] = { backgroundColor: 'var(--pink)', boxShadow: 'inset 0 0 0 4px var(--outline)' };

  const boardDarkColors = { purple: 'var(--board-purple)', green: 'var(--board-green)', slate: 'var(--board-slate)' };
  const darkEffective = settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  const whiteOrientation = mode === 'local'
    ? (localSession?.options.orientation === 'auto' ? sideToMove === 'w' : !settings.flipBoard)
    : (human === 'w') !== settings.flipBoard;

  const options = {
    position: fen,
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
    boardStyle: { borderRadius: '12px', overflow: 'hidden' },
  };

  return <DashboardLayout
    chess={chess} fen={fen} human={human} sideChoice={sideChoice} difficulty={difficulty} config={config}
    engineState={engineState} engineError={engineError} thinking={thinking} hints={hints} promotion={promotion}
    notice={notice} resigned={resigned} pgn={pgn} setPgn={setPgn} reviewRows={reviewRows}
    reviewState={reviewState} reviewProgress={reviewProgress} status={status} sideToMove={sideToMove}
    options={options} moveListRef={moveListRef} moves={moves} startGame={startGame} setDifficulty={setDifficulty}
    requestHint={requestHint} undo={undo} setResigned={setResigned} setNotice={setNotice}
    importFinishedPgn={importFinishedPgn} promote={promote} setPromotion={setPromotion}
    onBoardKeyDown={onBoardKeyDown} dragState={dragState}
    onBoardPointerDown={onBoardPointerDown} onBoardPointerMove={onBoardPointerMove}
    onBoardPointerUp={onBoardPointerUp} onBoardPointerCancel={onBoardPointerCancel} onBoardMouseLeave={onBoardMouseLeave}
    settings={settings} onSettingsChange={changeSettings} resetSettings={resetSettings}
    clearSavedGame={() => { startGame(); try { localStorage.removeItem('chessflow-live.saved-game.v1'); } catch { /* storage may be unavailable */ } }}
    mode={mode} localSession={localSession} savedLocalGame={savedLocalGame} startLocalGame={startLocalGame}
    bestHintMove={bestHintMove} whiteOrientation={whiteOrientation}
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
