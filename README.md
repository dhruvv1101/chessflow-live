# ChessFlow Live

ChessFlow Live is a browser chess app for playing Stockfish, studying engine
lines, reviewing a finished PGN, and playing pass-and-play. Chess rules and
Stockfish 19 WASM analysis run in the visitor’s browser. A Vercel function can
turn verified Stockfish facts into a Gemini explanation; the app still works
when Gemini is not configured. Supabase is the recommended cloud option for
saved games. See [the project overview](docs/PROJECT_OVERVIEW.md) for the
feature inventory and architecture.

## Run locally

Requirements: Node.js 20.19+ or 22.12+.

```powershell
npm ci
npm run dev
```

`postinstall` copies the pinned Stockfish 19 Lite and Full JavaScript/WASM
builds into ignored `public/engine/`. The Full build loads when hints or PGN
analysis need it. Keep `.env.local` private and ignored; do not paste its
contents into logs or chat.

## Check and build

```powershell
npm run lint
npm test
npm run build
npm run test:smoke
```

The default Playwright suite mocks `/health` and `/analyze`, so it does not
need Docker or a live engine. The opt-in live checks are clearly separated in
`playwright/engine-routing.live.spec.js`; enable the relevant test environment
variable only when the local server is in the expected running/stopped state.
`playwright/layout-geometry.spec.js` checks light and dark layouts at 390, 1024,
1280, 1440 and 1920 pixels, and writes its screenshots to `docs/screenshots/`.
Other Playwright screenshots go to ignored `test-results/`.

## Engine settings

| Opponent setting | Skill | Search time |
|---|---:|---:|
| Easy | 3 | 200 ms |
| Medium | 8 | 400 ms |
| Hard | 14 | 800 ms |
| Max | 20 | 1,500 ms |

Values are in `src/config.js`. The opponent uses Lite unless Strong is selected.
Hints and PGN review use the Full browser engine, Skill 20, up to three lines,
and the configured hint time. The Full worker uses multiple threads only when
cross-origin isolation is available. If it cannot load, the app visibly falls
back to Lite. Scores remain normalized to White’s perspective internally.

## Optional local Docker engine (Windows PowerShell)

Docker Desktop must be running. From the repository root:

```powershell
npm run engine:build
npm run engine:start
npm run engine:check
npm run engine:logs
npm run engine:stop
```

The scripts use `chessflow-engine:latest`, map host port 8090 to container port
8080, name the container `chessflow-engine`, and allow the local Vite origin.
`engine:check` prints engine, threads, hash and health response time, or reports
that the server is not running. `VITE_ENGINE_API_URL` is optional for native
Stockfish hints; the normal app uses browser Stockfish.

For local Gemini requests through the Docker server, set `VITE_COACH_URL` to
the local `/api/coach/analyze` route and provide `GEMINI_API_KEY` to the
container’s server environment. Do not use a `VITE_` name for a Gemini key.
This local override does not depend on `VITE_ENGINE_API_URL`. The Docker server
remains local-only; no hosted engine server is required or included in the
Vercel coach flow. See [server/README.md](server/README.md) and
[server/DEPLOY.md](server/DEPLOY.md) for local API details and deployment
preparation files; this repository task does not deploy them.

## Vercel setup

1. Import the existing `chessflow-live` repository as a Vite project.
2. Use the repository root, `npm run build` and `dist` as the output directory.
3. Add `GEMINI_API_KEY` as a server-only Vercel environment variable. Optionally
   configure `GEMINI_MODEL` and `ALLOWED_ORIGINS`. The function defaults to the
   production site origin when `ALLOWED_ORIGINS` is absent.
4. If you enable login enforcement with `COACH_REQUIRE_LOGIN`, also configure
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Vercel project. These
   two Vite values are public browser configuration. Never use a service-role
   key in client code or this coach function.
5. For cloud saves, follow [Supabase setup](docs/supabase-setup.md) and set the
   same two public Supabase variable names in Vercel.
   See [sign-in provider setup](docs/auth-setup.md) for GitHub OAuth, email
   magic links, provider switches and callback troubleshooting.
6. Deploy from the Vercel dashboard when you choose. Redeploy after changing
   function or Vite environment settings. This code change itself does not
   contact Vercel or deploy anything.

The Vercel function is `api/coach.js`; it validates the supplied chess facts,
limits Gemini to a short request, filters unverified SAN/UCI claims, and returns
Stockfish-only explanations on provider failure. Function duration is set to
30 seconds in `vercel.json`. See [docs/coach.md](docs/coach.md) for security,
quota and model notes.

## Import and analysis

Paste a finished PGN to analyze each move with Stockfish 19 Full. The move list,
move navigation, keyboard controls and evaluation graph select historical
positions without changing the underlying game. Loss thresholds are
configurable in Settings. Opening names and trap claims are omitted when no
verified opening database is available. Training summaries are local and are
not official Elo ratings.

## Environment variable names

`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ENGINE_API_URL` (optional,
local engine only), `VITE_COACH_URL` (optional, local coach override),
`GEMINI_API_KEY`, `GEMINI_MODEL`, `ALLOWED_ORIGINS`, `COACH_REQUIRE_LOGIN`,
`VITE_AUTH_GITHUB_ENABLED`, `VITE_AUTH_EMAIL_ENABLED`,
`VITE_AUTH_GOOGLE_ENABLED`, `RUN_LIVE_ENGINE_TESTS`,
`RUN_LIVE_ENGINE_STOPPED_TESTS`.

## License

ChessFlow Live is GPL-3.0-only. The bundled engine is from `stockfish@19.0.1`;
see [NOTICE-STOCKFISH-LICENSE.txt](NOTICE-STOCKFISH-LICENSE.txt).
