# ChessFlow Live

A static chess app: play against Stockfish, request MultiPV hints, and review finished PGNs. By default, chess and analysis run in the browser. An optional native Stockfish API lives in `server/`; it is never required for the static client. No login, database, or live-game automation.

## Local development

Requirements: Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

Vite opens the app locally. `postinstall` copies pinned Stockfish 19 Lite and Full JavaScript/WASM builds into the ignored `public/engine/` directory. The Full build is fetched lazily for hints, analysis, or when Strong is selected in Settings. Set `VITE_ENGINE_API_URL` in `.env.local` to use a native analysis API; copy `.env.example` as a starting point. Leave it empty for browser-only analysis.

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

The optional API is in [`server/`](server/README.md). It runs one native engine process, allows only configured website origins, validates positions and search ranges, caps request bodies, and applies a per-instance rate limit. It is not deployed by this repository and has no client-side key. API setup and Fly.io/Render instructions are in [server/README.md](server/README.md).

## Deploy to Vercel

1. Push this folder as a GitHub repository named `chessflow-live`.
2. In Vercel, select **Add New → Project**, import `dhruvv1101/chessflow-live`, and authorize access if prompted.
3. Set **Framework Preset** to **Vite**.
4. Set **Root Directory** to `./`.
5. Set **Build Command** to `npm run build` and **Output Directory** to `dist`.
6. Leave install command at `npm install`; the postinstall script copies browser engine assets. Set `VITE_ENGINE_API_URL` only if you have deployed the optional API. `vercel.json` configures COOP/COEP for the optional multi-thread browser engine and immutable caching for `/engine/*`.
7. Select **Deploy** when you are ready.

The Full build is fetched from the static deployment only when selected/needed. Each Full WASM is about 99 MB; verify the current Vercel file-size limit and plan before importing this build.

## Engine and licensing

This project is licensed under GPL-3.0; see [LICENSE](LICENSE). Stockfish's upstream source is [github.com/nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js), with the upstream Stockfish engine at [github.com/official-stockfish/Stockfish](https://github.com/official-stockfish/Stockfish). The included engine files are from pinned npm package `stockfish@19.0.1`, build `stockfish-19-lite-single`. Its full license is included in [NOTICE-STOCKFISH-LICENSE.txt](NOTICE-STOCKFISH-LICENSE.txt).

The Lite neural network is much smaller than Stockfish's full build; strength and search depth depend on the user's device and the selected time limit. Browser workers can be throttled in background tabs. Hints are recommendations, not guaranteed best play. PGN review uses short, independent before/after searches and can take time for long games.
