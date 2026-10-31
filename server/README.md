# Optional native Stockfish API

The API runs one native Stockfish process and serves legal-position analysis at `/analyze`. Local runs and deployments require an explicit CORS allowlist. Keep the Vite setting `VITE_ENGINE_API_URL` empty to use browser analysis only.

## Local run

Python 3.12 and a local Stockfish binary are required.

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

Set the engine path and permitted website origin, then start the service:

```bash
# Windows PowerShell
$env:STOCKFISH_PATH = "C:\path\to\stockfish.exe"
$env:ALLOWED_ORIGINS = "http://localhost:5173"
uvicorn app:app --host 0.0.0.0 --port 8080
```

The Docker image installs the official Stockfish 19 x86-64 universal Linux release and verifies its SHA-256. The universal build selects CPU features at runtime. `SF_THREADS` defaults to `2`; `SF_HASH_MB` defaults to `128`; set `ALLOWED_ORIGINS` to comma-separated, exact website origins (scheme and host, no trailing slash). The service port is `8080`, and its health path is `/health`.

## Fly.io (Docker)

Use a region close to the largest group of users to reduce round-trip latency. Fly's region selector lists available region codes; confirm the current list before choosing one. The Stockfish process starts during machine startup, so cold starts include binary initialization. Configure an always-running machine if this latency is unsuitable.

From the repository's `server/` directory:

```bash
fly launch --no-deploy --dockerfile Dockerfile
```

In the generated `fly.toml`, keep `internal_port = 8080`, set the region that best serves your users, and configure an HTTP health check for `/health` with a startup grace period long enough for Stockfish initialization. Put the non-secret allowlist and tuning values in `[env]`:

```toml
[env]
  ALLOWED_ORIGINS = "https://your-chessflow-site.example"
  SF_THREADS = "2"
  SF_HASH_MB = "128"

[http_service]
  internal_port = 8080
```

Add this health-check block under the Fly service configuration:

```toml
[[http_service.checks]]
  method = "GET"
  path = "/health"
  interval = "30s"
  timeout = "5s"
  grace_period = "30s"
```

Then, when you choose to deploy:

```bash
fly deploy
```

For more than one machine, scale with `fly scale count N`. Each machine has its own engine process and in-memory rate-limit buckets; rate limits are therefore per instance, not global. More machines increase aggregate capacity and compute cost. Verify current Fly pricing for the selected region and machine size before deploying.

## Render (Docker)

Create a **Web Service** and choose the repository. Select Docker, set the **Root Directory** to `server`, leave **Dockerfile Path** as `Dockerfile`, and set the health-check path to `/health`. Render sends web traffic to port `8080` from this Dockerfile; the app binds to `0.0.0.0`.

Choose a region close to your users and set these environment variables in the service dashboard:

```text
ALLOWED_ORIGINS=https://your-chessflow-site.example
SF_THREADS=2
SF_HASH_MB=128
```

The first request after a sleeping/free instance starts may wait for a cold boot; check the selected plan's current sleep and startup behavior. For more than one instance, set the instance count in Render's scaling settings. Every instance owns a separate Stockfish process and an in-memory rate-limit bucket, so rate limits are per instance and not global. Confirm current Render pricing and free-plan limitations for your region and instance type before selecting a plan.

## Client configuration

Set `VITE_ENGINE_API_URL` to the API origin (without `/analyze`), for example `https://analysis.example.com`. Add that exact client origin to `ALLOWED_ORIGINS`. The API has no shared key: it validates FEN and search limits, rejects other origins, limits request sizes, and rate-limits each client IP. A public CORS allowlist is not authentication; anyone can call the API outside browsers, so monitor usage and tighten the network policy if needed.

`/health` is intended for platform checks. `/analyze` accepts FENs up to 100 characters, 100–6000 ms, optional depth 1–24, MultiPV 1–3, and skill 0–20. Requests queue for at most two seconds; a busy engine returns HTTP 503.

## Platform documentation

- [Fly app configuration](https://fly.io/docs/reference/configuration/) — internal ports, regions, environment, and health checks.
- [Fly regions](https://fly.io/docs/reference/regions/)
- [Render Docker services](https://render.com/docs/docker)
- [Render health checks](https://render.com/docs/health-checks)
- [Render web services and regions](https://render.com/docs/web-services)

Pricing is intentionally not quoted here; **verify current pricing** with each platform before deployment.
