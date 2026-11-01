"""Optional Stockfish analysis API for ChessFlow Live."""
from __future__ import annotations

import asyncio
import logging
import os
import ipaddress
import json
import re
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from typing import Annotated

import chess
import chess.engine
import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from starlette.responses import JSONResponse

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("chessflow.server")
STOCKFISH_PATH = os.getenv("STOCKFISH_PATH", "/usr/local/bin/stockfish")
SF_THREADS = int(os.getenv("SF_THREADS", "2"))
SF_HASH_MB = int(os.getenv("SF_HASH_MB", "128"))
ALLOWED_ORIGINS = {origin.strip() for origin in os.getenv("ALLOWED_ORIGINS", "").split(",") if origin.strip()}
MAX_BODY_BYTES = 16 * 1024
RATE_LIMIT = 30
RATE_WINDOW_SECONDS = 60
DAILY_REQUEST_CAP = max(0, int(os.getenv("DAILY_REQUEST_CAP", "1000")))
BUSY_TIMEOUT_SECONDS = 2.0


class BodySizeLimitMiddleware:
    def __init__(self, app, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        guarded_paths = {"/analyze", "/api/coach/analyze"}
        if scope["type"] != "http" or scope.get("path") not in guarded_paths or scope.get("method") != "POST":
            await self.app(scope, receive, send)
            return
        headers = {key.lower(): value for key, value in scope.get("headers", [])}
        try:
            if int(headers.get(b"content-length", b"0")) > self.max_bytes:
                raise ValueError("body too large")
        except ValueError:
            response = JSONResponse({"detail": "request body too large"}, status_code=413)
            await response(scope, receive, send)
            return
        chunks = []
        total = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            total += len(chunk)
            if total > self.max_bytes:
                response = JSONResponse({"detail": "request body too large"}, status_code=413)
                await response(scope, receive, send)
                return
            chunks.append(chunk)
            if not message.get("more_body", False):
                break
        body = b"".join(chunks)
        sent = False

        async def replay_body():
            nonlocal sent
            if not sent:
                sent = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        await self.app(scope, replay_body, send)


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fen: Annotated[str, Field(min_length=1, max_length=100)]
    movetime_ms: Annotated[int, Field(ge=100, le=6000)] = 3000
    depth: Annotated[int | None, Field(ge=1, le=24)] = None
    multipv: Annotated[int, Field(ge=1, le=3)] = 3
    skill: Annotated[int, Field(ge=0, le=20)] = 20


class CoachVariation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    uci: Annotated[list[str], Field(max_length=10)]
    san: Annotated[list[str], Field(max_length=10)]


class CoachRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fen: Annotated[str, Field(min_length=1, max_length=100)]
    previous_fen: Annotated[str, Field(min_length=1, max_length=100)]
    move_san: Annotated[str, Field(min_length=2, max_length=16)]
    move_uci: Annotated[str, Field(pattern=r"^[a-h][1-8][a-h][1-8][qrbn]?$")]
    best_uci: Annotated[str, Field(pattern=r"^[a-h][1-8][a-h][1-8][qrbn]?$")]
    evaluation_before: int | None = None
    evaluation_after: int | None = None
    evaluation_loss: Annotated[int, Field(ge=0, le=200_000)]
    variations: Annotated[list[CoachVariation], Field(min_length=1, max_length=3)]
    punishment_variations: Annotated[list[CoachVariation], Field(min_length=1, max_length=3)]
    opponent_response: Annotated[str, Field(max_length=16)] = ""
    side_to_move: Annotated[str, Field(pattern=r"^[wb]$")]
    game_phase: Annotated[str, Field(max_length=20)] = "unknown"
    motifs: Annotated[list[str], Field(max_length=8)] = Field(default_factory=list)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.engine_lock = asyncio.Lock()
    app.state.rate_buckets = defaultdict(deque)
    app.state.daily_counts = defaultdict(int)
    app.state.daily_date = time.strftime("%Y-%m-%d", time.gmtime())
    if os.getenv("ENVIRONMENT", "production").lower() == "production" and not ALLOWED_ORIGINS:
        raise RuntimeError("ALLOWED_ORIGINS must be set in production.")
    try:
        engine = await asyncio.to_thread(chess.engine.SimpleEngine.popen_uci, STOCKFISH_PATH)
        options = {option.name.lower(): option for option in engine.options.values()}
        engine.configure({options[key].name: value for key, value in (
            ("threads", SF_THREADS), ("hash", SF_HASH_MB), ("uci_limitstrength", False)
        ) if key in options})
        app.state.engine = engine
        app.state.engine_name = str(engine.id.get("name", "Stockfish"))
        logger.info("Started engine %s threads=%s hash=%sMB", app.state.engine_name, SF_THREADS, SF_HASH_MB)
    except Exception:
        logger.exception("Could not start Stockfish at %s", STOCKFISH_PATH)
        raise
    try:
        yield
    finally:
        if engine:
            await asyncio.to_thread(engine.quit)


app = FastAPI(title="ChessFlow Live Analysis", version="1.0.0", lifespan=lifespan)
app.add_middleware(BodySizeLimitMiddleware, max_bytes=MAX_BODY_BYTES)
# The request guard enforces the env allowlist; wildcard here lets that allowlist
# be read at startup without reflecting arbitrary origins.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


@app.middleware("http")
async def request_guard(request: Request, call_next):
    origin = request.headers.get("origin")
    if origin and origin not in ALLOWED_ORIGINS:
        return JSONResponse({"detail": "origin not allowed"}, status_code=403)
    try:
        content_length = int(request.headers.get("content-length", "0"))
    except ValueError:
        content_length = MAX_BODY_BYTES + 1
    if content_length > MAX_BODY_BYTES:
        return JSONResponse({"detail": "request body too large"}, status_code=413)
    if request.url.path in {"/analyze", "/api/coach/analyze"} and request.method == "POST":
        client_ip = _client_ip(request)
        now = time.monotonic()
        requests = request.app.state.rate_buckets[client_ip]
        while requests and now - requests[0] >= RATE_WINDOW_SECONDS:
            requests.popleft()
        if len(requests) >= RATE_LIMIT:
            return JSONResponse({"detail": "rate limit exceeded"}, status_code=429, headers={"Retry-After": "60"})
        today = time.strftime("%Y-%m-%d", time.gmtime())
        if request.app.state.daily_date != today:
            request.app.state.daily_date = today
            request.app.state.daily_counts.clear()
        if DAILY_REQUEST_CAP and sum(request.app.state.daily_counts.values()) >= DAILY_REQUEST_CAP:
            return JSONResponse({"detail": "daily request cap exceeded"}, status_code=429, headers={"Retry-After": "86400"})
        requests.append(now)
        request.app.state.daily_counts[today] += 1
    return await call_next(request)


def _client_ip(request: Request) -> str:
    """Trust provider headers only when this process is running on that provider."""
    if os.getenv("FLY_APP_NAME"):
        candidate = request.headers.get("fly-client-ip", "")
    elif os.getenv("RENDER") == "true":
        candidate = request.headers.get("x-forwarded-for", "").split(",", 1)[0].strip()
    else:
        candidate = ""
    try:
        return str(ipaddress.ip_address(candidate)) if candidate else (request.client.host if request.client else "unknown")
    except ValueError:
        return request.client.host if request.client else "unknown"


@app.get("/health")
async def health(request: Request):
    return {"ok": True, "engine": getattr(request.app.state, "engine_name", "Stockfish"), "threads": SF_THREADS, "hash_mb": SF_HASH_MB}


def _analyse_sync(engine, board, params: AnalyzeRequest, engine_name: str):
    engine.configure({"Skill Level": params.skill, "UCI_LimitStrength": False})
    limit = chess.engine.Limit(time=params.movetime_ms / 1000, depth=params.depth)
    started = time.monotonic()
    infos = engine.analyse(board, limit, multipv=params.multipv)
    elapsed_ms = round((time.monotonic() - started) * 1000)
    if isinstance(infos, dict):
        infos = [infos]
    lines = []
    maximum_depth = 0
    nodes = 0
    for rank, info in enumerate(infos, start=1):
        pv = info.get("pv", [])[:10]
        if not pv:
            continue
        work = board.copy(stack=False)
        pv_san = []
        for move in pv:
            if move not in work.legal_moves:
                break
            pv_san.append(work.san(move))
            work.push(move)
        score = info.get("score")
        white = score.white() if score else None
        mate_white = white.mate() if white else None
        cp_white = white.score() if white and mate_white is None else None
        lines.append({"rank": rank, "uci": pv[0].uci(), "san": board.san(pv[0]), "pv_san": pv_san,
                      "pv_uci": [move.uci() for move in pv], "cp_white": cp_white, "mate_white": mate_white})
        maximum_depth = max(maximum_depth, int(info.get("depth", 0)))
        nodes = max(nodes, int(info.get("nodes", 0)))
    return {"lines": lines, "best_uci": lines[0]["uci"] if lines else None,
            "depth": maximum_depth, "nodes": nodes, "time_ms": elapsed_ms, "engine": engine_name}


@app.post("/analyze")
async def analyze(params: AnalyzeRequest, request: Request):
    try:
        board = chess.Board(params.fen)
    except (ValueError, TypeError) as error:
        raise HTTPException(status_code=400, detail="invalid FEN") from error
    if not board.is_valid():
        raise HTTPException(status_code=400, detail="invalid FEN position")
    if board.is_game_over(claim_draw=True):
        raise HTTPException(status_code=400, detail="position is already finished")
    lock = request.app.state.engine_lock
    try:
        await asyncio.wait_for(lock.acquire(), timeout=BUSY_TIMEOUT_SECONDS)
    except TimeoutError as error:
        raise HTTPException(status_code=503, detail="busy") from error
    try:
        return await asyncio.to_thread(_analyse_sync, request.app.state.engine, board, params, request.app.state.engine_name)
    except Exception as error:
        logger.exception("Analysis request failed")
        raise HTTPException(status_code=500, detail="analysis failed") from error
    finally:
        lock.release()


COACH_OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "what_happened": {"type": "string"},
        "why_bad": {"type": "string"},
        "opponent_punishment": {"type": "string"},
        "position_deterioration": {"type": "string"},
        "tactical_idea": {"type": "string"},
        "winning_plan": {"type": "string"},
        "lesson": {"type": "string"},
        "elo_tip": {"type": "string"},
        "punishment_line_index": {"type": "integer"},
    },
    "required": ["what_happened", "why_bad", "opponent_punishment", "position_deterioration",
                 "tactical_idea", "winning_plan", "lesson", "elo_tip", "punishment_line_index"],
}


def _validate_coach_evidence(params: CoachRequest) -> tuple[chess.Board, list[list[str]], list[list[str]]]:
    try:
        before = chess.Board(params.previous_fen)
        after = chess.Board(params.fen)
    except (ValueError, TypeError) as error:
        raise HTTPException(status_code=400, detail="invalid coach FEN") from error
    if not before.is_valid() or not after.is_valid():
        raise HTTPException(status_code=400, detail="invalid coach position")
    if before.turn != (chess.WHITE if params.side_to_move == "w" else chess.BLACK):
        raise HTTPException(status_code=400, detail="side to move does not match previous FEN")
    try:
        played = chess.Move.from_uci(params.move_uci)
        played_san = before.san(played)
        if played not in before.legal_moves or played_san != params.move_san:
            raise ValueError("played move does not match the legal move")
        before.push(played)
    except (ValueError, AssertionError) as error:
        raise HTTPException(status_code=400, detail="played move is invalid") from error
    # chess.js preserves a double-push target in FEN while python-chess defaults
    # to a legal en-passant target. Compare all state fields except that
    # representation-specific FEN field after validating the move itself.
    produced = before.fen().split()
    supplied = after.fen().split()
    if len(produced) != 6 or len(supplied) != 6 or [*produced[:3], *produced[4:]] != [*supplied[:3], *supplied[4:]]:
        raise HTTPException(status_code=400, detail="previous FEN and played move do not produce current FEN")
    try:
        best = chess.Move.from_uci(params.best_uci)
        if best not in chess.Board(params.previous_fen).legal_moves:
            raise ValueError("best move is illegal")
    except (ValueError, AssertionError) as error:
        raise HTTPException(status_code=400, detail="best move is invalid") from error
    def validate_lines(source_fen: str, variations: list[CoachVariation]) -> list[list[str]]:
        validated = []
        for variation in variations:
            if len(variation.uci) != len(variation.san):
                raise HTTPException(status_code=400, detail="variation SAN and UCI lengths differ")
            board = chess.Board(source_fen)
            clean_line = []
            try:
                for uci, san in zip(variation.uci, variation.san):
                    move = chess.Move.from_uci(uci)
                    if move not in board.legal_moves or board.san(move) != san:
                        raise ValueError("illegal or mismatched variation move")
                    clean_line.append(san)
                    board.push(move)
            except (ValueError, AssertionError) as error:
                raise HTTPException(status_code=400, detail="variation contains an invalid move") from error
            validated.append(clean_line)
        return validated

    validated_lines = validate_lines(params.previous_fen, params.variations)
    punishment_lines = validate_lines(params.fen, params.punishment_variations)
    if params.opponent_response:
        try:
            response_move = chess.Move.from_uci(params.opponent_response)
            if response_move not in after.legal_moves:
                raise ValueError("illegal response")
        except (ValueError, AssertionError) as error:
            raise HTTPException(status_code=400, detail="opponent response is invalid") from error
    return after, validated_lines, punishment_lines


def _sanitize_coach_text(value: str, allowed_tokens: set[str]) -> str:
    """Remove move-shaped tokens the engine did not supply; keep narration as plain text."""
    text = value[:1200]
    uci_token = re.compile(r"(?<![A-Za-z0-9])[a-h][1-8][a-h][1-8][qrbn]?(?![A-Za-z0-9])")
    san_token = re.compile(r"(?<![A-Za-z0-9])(?:O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)(?![A-Za-z0-9])")
    text = uci_token.sub(lambda match: match.group(0) if match.group(0) in allowed_tokens else "[unverified move omitted]", text)
    text = san_token.sub(lambda match: match.group(0) if match.group(0) in allowed_tokens else "[unverified move omitted]", text)
    return text


@app.post("/api/coach/analyze")
async def coach_analyze(params: CoachRequest):
    after, lines, punishment_lines = _validate_coach_evidence(params)
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="coach is not configured; Stockfish analysis remains available")
    allowed_tokens = {params.move_san, params.move_uci}
    allowed_tokens.add(chess.Board(params.previous_fen).san(chess.Move.from_uci(params.best_uci)))
    allowed_tokens.update(token for line in lines + punishment_lines for token in line)
    if params.opponent_response:
        allowed_tokens.add(after.san(chess.Move.from_uci(params.opponent_response)))
    supplied_evidence = {
        "current_fen": params.fen, "previous_fen": params.previous_fen,
        "played_move": {"san": params.move_san, "uci": params.move_uci},
        "best_move": {"san": chess.Board(params.previous_fen).san(chess.Move.from_uci(params.best_uci)), "uci": params.best_uci},
        "evaluation_before_white_cp": params.evaluation_before,
        "evaluation_after_white_cp": params.evaluation_after,
        "loss_cp_from_mover_perspective": params.evaluation_loss,
        "engine_variations_san": lines,
        "verified_punishment_lines_san": punishment_lines,
        "opponent_response_uci": params.opponent_response,
        "side_to_move": params.side_to_move, "game_phase": params.game_phase,
        "engine_detected_motifs": params.motifs,
    }
    prompt = ("You are a beginner-friendly chess coach. Explain only the supplied Stockfish evidence. "
              "Do not invent, alter, or recommend any chess move or variation. Refer to moves only from the supplied legal move tokens and lines. "
              "If the evidence does not prove a tactic, say the engine evidence is positional/uncertain. "
              "Use short plain-language answers; never claim an official rating. Return JSON matching the schema. Evidence:\n" + json.dumps(supplied_evidence))
    model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseFormat": {"text": {"mimeType": "application/json", "schema": COACH_OUTPUT_SCHEMA}}, "maxOutputTokens": 900},
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(18.0, connect=4.0)) as client:
            response = await client.post(endpoint, headers={"x-goog-api-key": api_key, "Content-Type": "application/json"}, json=body)
        if response.status_code == 429:
            raise HTTPException(status_code=429, detail="coach rate limit reached; Stockfish analysis remains available")
        response.raise_for_status()
        model_body = response.json()
        generated = model_body["candidates"][0]["content"]["parts"][0]["text"]
        explanation = json.loads(generated)
        required = {"what_happened", "why_bad", "opponent_punishment", "position_deterioration", "tactical_idea", "winning_plan", "lesson", "elo_tip", "punishment_line_index"}
        if set(explanation) != required or not all(isinstance(explanation[key], str) for key in required - {"punishment_line_index"}):
            raise ValueError("invalid coach response schema")
        line_index = explanation["punishment_line_index"]
        if not isinstance(line_index, int) or not 0 <= line_index < len(punishment_lines):
            raise ValueError("invalid punishment line index")
        for key in required - {"punishment_line_index"}:
            explanation[key] = _sanitize_coach_text(explanation[key], allowed_tokens)
        # The displayed punishment line is always copied from the validated engine PV.
        explanation["punishment_line"] = punishment_lines[line_index]
        return {"explanation": explanation, "model": model}
    except HTTPException:
        raise
    except httpx.TimeoutException as error:
        raise HTTPException(status_code=504, detail="coach request timed out; Stockfish analysis remains available") from error
    except (httpx.HTTPError, KeyError, IndexError, ValueError, json.JSONDecodeError) as error:
        logger.warning("Coach request failed (%s)", type(error).__name__)
        raise HTTPException(status_code=502, detail="coach response unavailable; Stockfish analysis remains available") from error
