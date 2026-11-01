"""Optional Stockfish analysis API for ChessFlow Live."""
from __future__ import annotations

import asyncio
import logging
import os
import ipaddress
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from typing import Annotated

import chess
import chess.engine
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
        if scope["type"] != "http" or scope.get("path") != "/analyze" or scope.get("method") != "POST":
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
    if request.url.path == "/analyze" and request.method == "POST":
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
