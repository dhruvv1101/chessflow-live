# Deploying the optional Stockfish server

The browser engine remains available when this API is offline. Hints and analysis fall back to it automatically. The service uses one Stockfish process, defaults to 2 threads and 128 MB hash, limits each source IP to 30 requests per rolling minute, and caps each process at `DAILY_REQUEST_CAP=1000` analysis requests received per UTC day. Set the cap to `0` only if you intentionally want no daily cap. The daily counter is in memory; restarts reset it and multiple instances each have their own counter, so configure it conservatively and monitor provider usage. These limits reduce accidental abuse; they are not a billing guarantee or DDoS protection.

Fly and Render configuration files keep `ALLOWED_ORIGINS` out of the repository. Configure it as a secret/environment variable with the exact public client origins, comma-separated if needed. Fly rate limiting uses the provider-supplied `Fly-Client-IP`; Render trusts `X-Forwarded-For` only when the platform sets `RENDER=true`. Local requests ignore forwarded headers.

## Fly.io

The included `fly.toml` defaults to `shared-cpu-2x` with 1 GB RAM, one always-running machine, internal port 8080, and `/health` checks. Prices change; verify on the provider's pricing page: <https://fly.io/docs/about/pricing/>. Choose a region and globally unique app name before the first launch; edit `primary_region`/`app` in `fly.toml` if you want to pin them. Then run from `server/`:

```sh
fly auth login
fly launch --no-deploy
fly secrets set ALLOWED_ORIGINS=https://YOUR-VERCEL-DOMAIN
fly deploy
fly status
fly logs
```

`fly launch --no-deploy` creates/selects the app and uses the checked-in Docker config. Confirm it selected the `server` directory if run from the repository root; running in `server/` avoids that ambiguity. `ALLOWED_ORIGINS` is set as a Fly secret and is deliberately absent from `fly.toml`.

## Render

The included `render.yaml` describes a Docker web service, `/health` health check, one Starter instance, and the same engine/cap defaults. In the Render dashboard choose **New + → Blueprint**, connect the repository, and apply the Blueprint. Set `ALLOWED_ORIGINS` as a secret environment variable for the service when prompted. Render Starter and other plan prices change; verify on the provider's pricing page: <https://render.com/pricing/>.

Render's free web tier has 0.1 CPU and spins down after 15 minutes without inbound traffic. It is not suitable for real Stockfish analysis: cold starts and limited CPU make searches slow or unavailable. Verify current free-tier limits on the provider's pricing page: <https://render.com/pricing/>.

## Test the API

Replace the URL with the deployed service URL:

```sh
curl https://YOUR-SERVER/health
curl -i -X POST https://YOUR-SERVER/analyze \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://YOUR-VERCEL-DOMAIN' \
  --data '{"fen":"6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1","movetime_ms":1000,"multipv":1}'
```

The analysis response includes `best_uci`, `depth`, `nodes`, engine name, and lines. A rejected origin returns 403; invalid FEN returns 400; per-IP and daily limits return 429.

## Connect the Vercel client

In the Vercel project, add `VITE_ENGINE_API_URL=https://YOUR-SERVER` under **Settings → Environment Variables** for the client environments you use, then redeploy the client. To disable server analysis without redeploying the server, set `VITE_ENGINE_SERVER_ENABLED=false` in Vercel and redeploy the client; the bundled client then uses its browser engine. Re-enable with `true` or remove the variable and redeploy the client. Vite environment changes require a new client build/deployment.

The client polls `/health` every 60 seconds while the tab is visible. Its status chip shows Online, Offline, or Using browser engine. Settings reports the last health response time, engine name, and thread count.

For local dev, put `VITE_ENGINE_API_URL=http://localhost:8090` in `.env.local` when Docker publishes host port 8090 to container port 8080. `.env.local` is ignored by git.
