# ChessFlow Live

A chess app: play against Stockfish, request MultiPV hints, and review finished PGNs. By default, chess and analysis run in the browser. The native Stockfish API in `server/` is optional; Supabase is the recommended cloud option for per-user saved games, while local browser play and saves work without an account.

## Local development

Requirements: Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

Vite opens the app locally. `postinstall` copies pinned Stockfish 19 Lite and Full JavaScript/WASM builds into the ignored `public/engine/` directory. The Full build is fetched lazily for hints, analysis, or when Strong is selected in Settings. Set `VITE_ENGINE_API_URL` in `.env.local` to use a native analysis API; copy `.env.example` as a starting point. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to enable Supabase cloud saves. Leave these settings out to use browser-only analysis and local saves.

```bash
npm test
npm run lint
npm run build
```

## Difficulty mapping

| Difficulty | Stockfish Skill Level | Search time |
|---|---:|---:|
| Easy | 3 | 200 ms |
| Medium | 8 | 400 ms |
| Hard | 14 | 800 ms |
| Max | 20 | 1,500 ms |

These values live together in `src/config.js`. The AI opponent uses Lite unless Strong is selected. Hints use Full Stockfish at Skill 20, MultiPV 3, and the Settings search time; the Full worker selects multi-thread only when cross-origin isolation is available. If Full fails, the app labels the Lite fallback. Scores are kept for White's evaluation bar and converted to the side-to-move perspective where appropriate. The future-move box shows up to ten plies from the leading PV.

The optional API is in [`server/`](server/README.md). It runs one native engine process, allows only configured website origins, validates positions and search ranges, caps request bodies, and applies per-IP and daily limits. API setup, Fly.io/Render instructions, and client fallback controls are in [server/DEPLOY.md](server/DEPLOY.md). Supabase is the recommended cloud option for saved games; see [Supabase setup](docs/supabase-setup.md).

## Deploy to Vercel

1. Push this folder as a GitHub repository named `chessflow-live`.
2. In Vercel, select **Add New → Project**, import `dhruvv1101/chessflow-live`, and authorize access if prompted.
3. Set **Framework Preset** to **Vite**.
4. Set **Root Directory** to `./`.
5. Set **Build Command** to `npm run build` and **Output Directory** to `dist`.
6. Leave install command at `npm install`; the postinstall script copies browser engine assets. Add `VITE_ENGINE_API_URL` if you use the optional API and `VITE_SUPABASE_URL` plus `VITE_SUPABASE_ANON_KEY` for cloud saves. Redeploy after changing Vite environment variables. `vercel.json` configures COOP/COEP for the optional multi-thread browser engine and immutable caching for `/engine/*`.
7. Select **Deploy** when you are ready.

The Full build is fetched from the static deployment only when selected/needed. Each Full WASM is about 99 MB; verify the current Vercel file-size limit and plan before importing this build.

## Local Docker engine (Windows PowerShell)

Docker Desktop must be running. From the repository root, these npm scripts build the existing server Dockerfile, start the named container detached on host port 8090, check `/health`, and stop/show logs:

```powershell
npm run engine:build
npm run engine:start
npm run engine:check
npm run engine:logs
npm run engine:stop
```

`engine:start` uses the local image `chessflow-engine:latest`, maps `8090:8080`, names the container `chessflow-engine`, and sets `ALLOWED_ORIGINS=http://localhost:5173`. `engine:check` prints engine name, thread count, hash size, and health response time, or says `Engine server not running`. For local Vite testing, use `VITE_ENGINE_API_URL=http://localhost:8090`.

## Engine and licensing

This project is licensed under GPL-3.0; see [LICENSE](LICENSE). Stockfish's upstream source is [github.com/nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js), with the upstream Stockfish engine at [github.com/official-stockfish/Stockfish](https://github.com/official-stockfish/Stockfish). The included engine files are from pinned npm package `stockfish@19.0.1`, build `stockfish-19-lite-single`. Its full license is included in [NOTICE-STOCKFISH-LICENSE.txt](NOTICE-STOCKFISH-LICENSE.txt).

The Lite neural network is much smaller than Stockfish's full build; strength and search depth depend on the user's device and the selected time limit. Browser workers can be throttled in background tabs. Hints are recommendations, not guaranteed best play. PGN review uses short, independent before/after searches and can take time for long games.
