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


def test_coach_requires_server_side_api_key(client, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    response = client[0].post("/api/coach/analyze", json={
        "previous_fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
        "move_san": "e4", "move_uci": "e2e4", "best_uci": "e2e4",
        "evaluation_before": 20, "evaluation_after": 18, "evaluation_loss": 2,
        "variations": [{"uci": ["e2e4", "e7e5"], "san": ["e4", "e5"]}],
        "punishment_variations": [{"uci": ["e7e5", "g1f3"], "san": ["e5", "Nf3"]}],
        "opponent_response": "e7e5", "side_to_move": "w", "game_phase": "opening", "motifs": [],
    })
    assert response.status_code == 503
    assert "not configured" in response.json()["detail"]


def test_coach_rejects_an_illegal_or_mismatched_move(client, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-only")
    response = client[0].post("/api/coach/analyze", json={
        "previous_fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
        "move_san": "e4", "move_uci": "e2e5", "best_uci": "e2e4",
        "evaluation_before": 20, "evaluation_after": 18, "evaluation_loss": 2,
        "variations": [{"uci": ["e2e4"], "san": ["e4"]}], "punishment_variations": [{"uci": ["e7e5"], "san": ["e5"]}],
        "opponent_response": "", "side_to_move": "w", "game_phase": "opening", "motifs": [],
    })
    assert response.status_code == 400
    assert "move" in response.json()["detail"]


def test_coach_discards_model_moves_outside_validated_stockfish_lines(monkeypatch):
    import asyncio
    import json

    monkeypatch.setenv("GEMINI_API_KEY", "test-only")
    generated = {
        "what_happened": "Qh5 is a better move than e4.", "why_bad": "The move gave up time.",
        "opponent_punishment": "e5 develops a piece.", "position_deterioration": "The line stays balanced.",
        "tactical_idea": "No tactic is established.", "winning_plan": "Develop pieces.",
        "lesson": "Develop before attacking.", "elo_tip": "Review candidate moves.", "punishment_line_index": 0,
    }
    response_body = {"candidates": [{"content": {"parts": [{"text": json.dumps(generated)}]}}]}

    class FakeResponse:
        status_code = 200
        def raise_for_status(self): pass
        def json(self): return response_body

    class FakeAsyncClient:
        def __init__(self, **_kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *_args): pass
        async def post(self, _url, *, headers, json):
            assert headers["x-goog-api-key"] == "test-only"
            assert json["generationConfig"]["responseFormat"]["text"]["mimeType"] == "application/json"
            return FakeResponse()

    monkeypatch.setattr(api.httpx, "AsyncClient", FakeAsyncClient)
    payload = api.CoachRequest.model_validate({
        "previous_fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
        "move_san": "e4", "move_uci": "e2e4", "best_uci": "e2e4", "evaluation_loss": 0,
        "variations": [{"uci": ["e2e4", "e7e5"], "san": ["e4", "e5"]}],
        "punishment_variations": [{"uci": ["e7e5", "g1f3"], "san": ["e5", "Nf3"]}],
        "opponent_response": "e7e5", "side_to_move": "w", "game_phase": "opening",
    })
    result = asyncio.run(api.coach_analyze(payload))
    assert "unverified move omitted" in result["explanation"]["what_happened"]
    assert result["explanation"]["punishment_line"] == ["e5", "Nf3"]


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
