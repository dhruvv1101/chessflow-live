import os
from pathlib import Path
from types import SimpleNamespace

import chess
import chess.engine
import pytest
from fastapi.testclient import TestClient
import httpx

import app as api

FEN = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1"


class FakeEngine:
    id = {"name": "Stockfish test double"}
    options = {name: SimpleNamespace(name=name) for name in ("Threads", "Hash", "UCI_LimitStrength", "Skill Level")}

    def __init__(self):
        self.configurations = []

    def configure(self, values):
        self.configurations.append(values)

    def analyse(self, board, limit, multipv=1):
        moves = [chess.Move.from_uci("a1a8"), chess.Move.from_uci("a1a7")][:multipv]
        return [{"pv": [move], "score": chess.engine.PovScore(chess.engine.Mate(1), chess.WHITE),
                 "depth": 18, "nodes": 123456} for move in moves]

    def quit(self):
        self.closed = True


@pytest.fixture
def client(monkeypatch):
    engine = FakeEngine()
    monkeypatch.setattr(api, "ALLOWED_ORIGINS", {"https://chessflow.example"})
    monkeypatch.setattr(chess.engine.SimpleEngine, "popen_uci", lambda _: engine)
    with TestClient(api.app) as test_client:
        yield test_client, engine


def test_health_reports_engine_and_configuration(client):
    response = client[0].get("/health")
    assert response.json() == {"ok": True, "engine": "Stockfish test double", "threads": api.SF_THREADS, "hash_mb": api.SF_HASH_MB}


def test_invalid_fen_is_rejected(client):
    assert client[0].post("/analyze", json={"fen": "not a fen"}).status_code == 400


def test_finished_position_is_rejected(client):
    mate = "7k/6Q1/6K1/8/8/8/8/8 b - - 0 1"
    response = client[0].post("/analyze", json={"fen": mate})
    assert response.status_code == 400
    assert "finished" in response.json()["detail"]


@pytest.mark.parametrize("body", [
    {"fen": FEN, "movetime_ms": 99}, {"fen": FEN, "movetime_ms": 6001},
    {"fen": FEN, "depth": 25}, {"fen": FEN, "depth": 0},
    {"fen": FEN, "multipv": 4}, {"fen": FEN, "skill": 21},
])
def test_bad_ranges_are_rejected(client, body):
    assert client[0].post("/analyze", json=body).status_code == 422


def test_cors_rejects_unknown_origin(client):
    response = client[0].post("/analyze", json={"fen": FEN}, headers={"Origin": "https://evil.example"})
    assert response.status_code == 403


def test_request_body_is_capped(client):
    response = client[0].post("/analyze", content=b"x" * (api.MAX_BODY_BYTES + 1), headers={"Content-Type": "application/json"})
    assert response.status_code == 413


def test_production_requires_a_cors_allowlist(monkeypatch):
    monkeypatch.setattr(api, "ALLOWED_ORIGINS", set())
    with pytest.raises(RuntimeError, match="ALLOWED_ORIGINS"):
        with TestClient(api.app):
            pass


def test_rate_limiter_returns_429(client, monkeypatch):
    monkeypatch.setattr(api, "RATE_LIMIT", 1)
    headers = {"X-Forwarded-For": "198.51.100.7"}
    assert client[0].post("/analyze", json={"fen": FEN}, headers=headers).status_code == 200
    response = client[0].post("/analyze", json={"fen": FEN}, headers=headers)
    assert response.status_code == 429
    assert response.json()["detail"] == "rate limit exceeded"


def test_daily_cap_returns_429(client, monkeypatch):
    monkeypatch.setattr(api, "DAILY_REQUEST_CAP", 1)
    assert client[0].post("/analyze", json={"fen": FEN}).status_code == 200
    response = client[0].post("/analyze", json={"fen": FEN})
    assert response.status_code == 429
    assert response.json()["detail"] == "daily request cap exceeded"


def test_untrusted_forwarded_for_is_ignored(client, monkeypatch):
    monkeypatch.delenv("FLY_APP_NAME", raising=False)
    monkeypatch.delenv("RENDER", raising=False)
    monkeypatch.setattr(api, "RATE_LIMIT", 1)
    assert client[0].post("/analyze", json={"fen": FEN}, headers={"X-Forwarded-For": "198.51.100.7"}).status_code == 200
    assert client[0].post("/analyze", json={"fen": FEN}, headers={"X-Forwarded-For": "203.0.113.9"}).status_code == 429


def test_busy_search_returns_503(client, monkeypatch):
    class BusyLock:
        async def acquire(self):
            await __import__("asyncio").sleep(0.1)
            return True
        def release(self):
            pass
    monkeypatch.setattr(api, "BUSY_TIMEOUT_SECONDS", 0.001)
    client[0].app.state.engine_lock = BusyLock()
    response = client[0].post("/analyze", json={"fen": FEN})
    assert response.status_code == 503
    assert response.json()["detail"] == "busy"


def test_response_has_white_score_san_and_ten_ply_fields(client):
    response = client[0].post("/analyze", json={"fen": FEN})
    assert response.status_code == 200
    assert response.json()["best_uci"] == "a1a8"
    assert response.json()["lines"][0] == {
        "rank": 1, "uci": "a1a8", "san": "Ra8#", "pv_san": ["Ra8#"],
        "pv_uci": ["a1a8"], "cp_white": None, "mate_white": 1,
    }
    assert response.json()["depth"] == 18
    assert response.json()["nodes"] == 123456


@pytest.mark.skipif(not Path(os.getenv("STOCKFISH_PATH", "/usr/local/bin/stockfish")).exists() and not os.getenv("STOCKFISH_API_URL"), reason="Set STOCKFISH_PATH or STOCKFISH_API_URL to run the real-engine test")
def test_real_stockfish_finds_back_rank_mate(monkeypatch):
    payload = {"fen": FEN, "movetime_ms": 1000, "multipv": 1, "skill": 20}
    if os.getenv("STOCKFISH_API_URL"):
        response = httpx.post(f"{os.environ['STOCKFISH_API_URL'].rstrip('/')}/analyze", json=payload, timeout=10)
    else:
        monkeypatch.setattr(api, "ALLOWED_ORIGINS", {"https://chessflow.example"})
        with TestClient(api.app) as test_client:
            response = test_client.post("/analyze", json=payload)
    assert response.status_code == 200
    assert response.json()["best_uci"] == "a1a8"
