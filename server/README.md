# Stockfish analysis API

The API runs one native Stockfish process and serves analysis at `/analyze`. The client uses its browser engine when this service is offline. For local development, Python 3.12 and Stockfish are required:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:STOCKFISH_PATH = "C:\path\to\stockfish.exe"
$env:ALLOWED_ORIGINS = "http://localhost:5173"
uvicorn app:app --host 0.0.0.0 --port 8080
```

The service honors `PORT` when present (otherwise 8080), requires an explicit `ALLOWED_ORIGINS` allowlist in production, caps request bodies, validates FEN/search limits, and applies both 30 requests per source IP per rolling minute and `DAILY_REQUEST_CAP` per process/day (default 1000; `0` disables the daily cap). Requests are serialized through one engine process; a busy engine returns 503. Per-IP and daily counters are in-memory and per instance. Fly uses its trusted `Fly-Client-IP` metadata; Render trusts forwarded IP only when `RENDER=true`; local X-Forwarded-For is ignored.

Deployment configuration and exact commands are in [DEPLOY.md](DEPLOY.md). Fly secrets keep `ALLOWED_ORIGINS` out of the config file. The Render Blueprint prompts for its `ALLOWED_ORIGINS` secret.

The GitHub workflow at `.github/workflows/server-ci.yml` runs pytest and builds the Docker image on pushes and pull requests. It does not publish or deploy the image.

## Optional Gemini explanations

The same FastAPI app exposes `POST /api/coach/analyze`. It accepts the played move, before/after FENs, White-perspective evaluations, and SAN/UCI variations from Stockfish; it validates each line with python-chess before making a request. The server returns a 503 when `GEMINI_API_KEY` is not set, so move analysis and browser hints keep working without Gemini. Keep `GEMINI_API_KEY` in the server process/container environment only. `GEMINI_MODEL` optionally selects a Gemini model; the default is `gemini-3.5-flash-lite`. Do not add either setting to Vite or client code.

For a local Docker run, pass the server-only environment variable to Docker from your PowerShell session after setting it securely in that session:

```powershell
docker run --rm -p 8090:8080 -e ALLOWED_ORIGINS=http://localhost:5173 -e GEMINI_API_KEY chessflow-engine:latest
```

The panel automatically requests an explanation for the currently selected inaccuracy, mistake, or blunder when the configured server is available. Explanations are cached locally by position, move, Stockfish version, and search settings. No key is bundled into the browser. The coach route sends the supplied position and engine evidence to Google's Gemini API only when an explanation is requested; without that server-side configuration, Stockfish evidence remains available.
