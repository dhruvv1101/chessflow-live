# ChessFlow Live — Project Overview

**Audit date:** 2026-11-02. **Scope:** checked-out source/configuration plus commands below. **Evidence labels:** **VERIFIED** means read directly from source/configuration or observed in a command run here; **INFERRED** means reasoned but not independently exercised. File paths are relative to repository root; function/component names identify evidence. No `.env.local`, token or key contents were read.

## 1. Executive summary

**VERIFIED.** ChessFlow Live is a browser chess app for casual players who want to play Stockfish, ask for candidate moves, review one completed PGN, or play pass-and-play locally. Chess legality and the main engine run in the browser. A new Vercel Node function can explain already-computed Stockfish facts with Gemini; the function has mocked tests, but no Vercel deployment or live Gemini call was performed. The native FastAPI/Stockfish Docker service remains local-only; no hosted engine server exists. Supabase client support is in source, but no project was accessed. Evidence: `src/App.jsx` (`requestHint`, `importFinishedPgn`, `explainMove`), `src/engine.js`, `api/coach.js`, `server/app.py`.

| Feature | Status | Evidence |
|---|---|---|
| Play vs AI | Working | **VERIFIED:** AI reply effect and `chooseMove` in `src/App.jsx`; legal move application in `src/game.js`. |
| Difficulty levels | Working | **VERIFIED:** Easy/Medium/Hard/Max in `src/config.js`; selection in `DashboardLayout.jsx`; play search in `App.jsx`. |
| Hints and analysis | Working | **VERIFIED:** `requestHint` in `src/App.jsx`; MultiPV/Future Moves in `src/DashboardLayout.jsx`; routing in `src/engine/engineRouter.js`. Live remote path unverified here. |
| Evaluation display | Working | **VERIFIED:** `toWhiteScore` in `src/game.js`; evaluation bar in `DashboardLayout.jsx`; `EvaluationGraph.jsx`. |
| Future-moves line | Working | **VERIFIED:** `.future-box` in `DashboardLayout.jsx`; PV conversion in `src/engine/remoteEngine.js` and `src/engine.js`. |
| Two-player mode | Working | **VERIFIED:** setup/clocks/draw/resign in `App.jsx`, `DashboardLayout.jsx`, `src/localGame.js`; `playwright/two-player.spec.js`. |
| Undo / resign / draw | Working | **VERIFIED:** `undo`, resign/draw handlers in `App.jsx`; controls in `DashboardLayout.jsx`; tests in `playwright/two-player.spec.js`. Draw offer is local two-player only. |
| PGN review | Partly working | **VERIFIED:** `importFinishedPgn` accepts one finished PGN, searches before/after each move and classifies evaluation loss. |
| Import: PGN | Partly working | **VERIFIED:** paste one finished game in `DashboardLayout.jsx`; parser/review in `App.jsx`; no multi-game workflow evidenced. |
| Import: FEN / FEN list / SAN-UCI / Lichess URL | Not implemented | **VERIFIED:** no import UI/handler found in `src/` or tests; FEN is internal and used for saved-game loading. |
| Export: PGN / FEN / JSON / SVG / PNG | Not implemented | **VERIFIED:** no export handlers/actions found in inspected source. |
| Pattern detection | Not implemented | **VERIFIED:** no detector/module/tests found. |
| AI explanations | Partly working | **VERIFIED:** `api/coach.js` validates supplied facts and calls Gemini; `src/engine/coach.js` uses same-origin `/api/coach` by default and provides Stockfish fallback; `api/coach.test.js` mocks failure/success paths. Not deployed or live-tested. |
| Saved games: IndexedDB | Working | **VERIFIED:** `src/cloud/savedGames.js` with localStorage fallback; `src/cloud/savedGames.test.js`; Settings UI. |
| Saved games: Supabase | Partly working | **VERIFIED:** client/config/save/load/auth paths in `src/cloud/supabase.js` and `src/CloudSavesPanel.jsx`. No remote project accessed; live state unverified. |
| Library page | Not implemented | **VERIFIED:** save list is inside Settings (`CloudSavesPanel.jsx`); no separate Library route/page. |
| Learning view | Not implemented | **VERIFIED:** no separate learning module/view found. |
| Dark/light themes | Working | **VERIFIED:** persisted theme in `src/settings.js`; effective theme in `App.jsx`; CSS tokens in `src/styles.css`; Playwright visual tests. |
| Settings | Working | **VERIFIED:** `src/SettingsPanel.jsx` covers appearance, board, local play, engine and data settings; `src/settings.test.js`. |
| Gesture / camera mode | Partly working | **VERIFIED:** pointer/click/drag and keyboard board controls in `App.jsx`/`DashboardLayout.jsx`; no camera feature found. |
| Native server engine | Partly working | **VERIFIED:** FastAPI/native engine and client router in `server/app.py`, `src/engine/remoteEngine.js`; live Playwright check is separate/opt-in; no hosted instance exists. |
| Vercel coach function | Partly working | **VERIFIED:** `api/coach.js`, `vercel.json` (30s), `docs/coach.md`; `api/coach.test.js`; Vercel/Gemini runtime not contacted. |
| Docker | Working by configuration; runtime not verified here | **VERIFIED:** `server/Dockerfile`, `scripts/engine-container.mjs`; daemon unavailable in this environment. |
| CI | Working configuration; not run here | **VERIFIED:** `.github/workflows/server-ci.yml` runs server pytest + Docker build; `.github/workflows/client-ci.yml` runs npm install/lint/unit/build/deterministic Playwright. GitHub was not contacted. |
| Hosting | Not deployed | **VERIFIED:** no cloud commands run; deployment files are preparation only; no hosted server verified. |

## 2. Repository map

Size classes: small <10 KB, medium 10–100 KB, large >100 KB. “Role” identifies runtime/build/test/docs. “Used” means a direct code/config reference was evident, not a formal whole-program proof. Directories are included. `node_modules`, `dist`, `.git` are excluded. Ignored Python cache dirs exist, but Windows denied traversal; their contents were not read. The private local environment file and contents were intentionally omitted.

| Path | Purpose / size | Role | Imported/used? |
|---|---|---|---|
| `.github/`, `.github/workflows/` | workflow dirs, small | CI | GitHub |
| `.github/workflows/server-ci.yml` | server tests + Docker build, small | CI | Actions |
| `.gitignore` | ignores local env, build output, generated engine and test artifacts, small | Build/repo hygiene | Git/npm/tooling |
| `db/`, `db/migrations/`, `db/tests/` | SQL dirs, small | DB/test | manual/DB test runner |
| `db/migrations/20261101000000_create_saved_games.sql` | table/RLS migration, small | DB | manually run |
| `db/tests/saved_games_rls.test.sql` | pgTAP owner-isolation test, small | Test | pgTAP/Postgres |
| `docs/`, `docs/screenshots/` | documentation/artifact dirs | Docs | no |
| `docs/supabase-setup.md` | Supabase setup instructions, small | Docs | no |
| `docs/screenshots/chessflow-dark-1280x800.png`, `chessflow-dark-390x844.png`, `chessflow-desktop-1280x800.png`, `chessflow-light-1280x800.png`, `chessflow-light-390x844.png`, `chessflow-phone-390x844.png` | historical UI shots, small/medium | Docs/generated | no |
| `docs/screenshots/dark-analysis-panel-1280x800.png`, `dark-analysis-panel-390x844.png`, `dark-game-1280x800.png`, `dark-game-390x844.png`, `dark-home-1280x800.png`, `dark-home-390x844.png`, `dark-settings-1280x800.png`, `dark-settings-390x844.png`, `dark-two-player-setup-1280x800.png`, `dark-two-player-setup-390x844.png` | dark captures, small/medium | Docs/generated | no |
| `docs/screenshots/light-analysis-panel-1280x800.png`, `light-analysis-panel-390x844.png`, `light-game-1280x800.png`, `light-game-390x844.png`, `light-home-1280x800.png`, `light-home-390x844.png`, `light-settings-1280x800.png`, `light-settings-390x844.png`, `light-two-player-setup-1280x800.png`, `light-two-player-setup-390x844.png` | light captures, small/medium | Docs/generated | no |
| `docs/screenshots/two-player-game-dark-1280x800.png`, `two-player-game-light-390x844.png`, `two-player-setup-dark-1280x800.png`, `two-player-setup-light-390x844.png` | two-player shots, medium | Docs/generated | no |
| `eslint.config.js` | lint rules, small | Build/dev quality | ESLint |
| `index.html` | HTML shell, small | Runtime/build | Vite |
| `LICENSE` | GPL project license, medium | Legal/docs | no |
| `NOTICE`, `NOTICE-STOCKFISH-LICENSE.txt` | notices / engine license, small and medium | Legal/docs | Docker/package |
| `package.json`, `package-lock.json` | scripts/deps; lockfile large | Build/runtime/test | npm |
| `playwright.config.js` | Edge/headless config, small | Test | Playwright |
| `playwright/dashboard.spec.js` | layout/board, small | Test | Playwright |
| `playwright/engine-routing.spec.js` | deterministic mocked online/offline/fallback, small | Test | Playwright |
| `playwright/engine-routing.live.spec.js` | optional live local-server checks, skipped unless explicitly enabled, small | Test | Playwright |
| `playwright/layout-geometry.spec.js` | responsive layout assertions and screenshots, small | Test | Playwright |
| `playwright/settings.spec.js` | settings/modal/focus/layout, small | Test | Playwright |
| `playwright/theme-visual.spec.js` | screenshots/contrast/pieces, small | Test | Playwright; writes screenshots |
| `playwright/two-player.spec.js` | local play/clocks/hints/draw/resign, small | Test | Playwright |
| `public/`, `public/assets/`, `public/engine/` | static asset dirs | Runtime | Vite/Vercel serve |
| `public/assets/chessflow-cover.jpg` | cover image, medium | Runtime/static | metadata reference in `index.html` |
| `public/favicon.svg` | favicon, small | Runtime/static | `index.html` |
| `public/engine/stockfish-19-lite-single.js` | Lite loader, medium | Generated/runtime | `src/engineAssets.js` |
| `public/engine/stockfish-19-lite-single.wasm` | Lite WASM ~1.85 MB, large | Generated/runtime | Lite worker |
| `public/engine/stockfish-19-single.js` | Full single loader, medium | Generated/runtime | `src/engineAssets.js` |
| `public/engine/stockfish-19-single.wasm` | Full WASM ~99 MB, large | Generated/runtime | Full worker |
| `public/engine/stockfish-19.js` | Full multi loader, medium | Generated/runtime | `src/engineAssets.js` |
| `public/engine/stockfish-19.wasm` | Full multi WASM ~99 MB, large | Generated/runtime | Full worker |
| `README.md` | local, Vercel, Docker instructions, small | Docs | no |
| `scripts/copy-engine.mjs` | copies npm builds/license to public, small | Build/postinstall | npm postinstall |
| `scripts/engine-container.mjs` | Docker operations wrapper, small | Operations | npm scripts |
| `server/`, `server/tests/` | API/test dirs | Server/test | Docker/pytest |
| `server/.dockerignore` | excludes caches/tests/env from image, small | Build | Docker |
| `server/app.py` | API/validation/rate controls, medium | Server runtime | Uvicorn |
| `server/DEPLOY.md` | provider/API prep guide, small | Docs | no |
| `server/Dockerfile` | Python + verified native engine image, small | Build/runtime | Docker |
| `server/fly.toml` | Fly config (uncommitted app/region edit), small | Deployment prep | Fly only |
| `server/NOTICE` | engine notice, small | Legal/build | Docker copies |
| `server/README.md` | server docs, small | Docs | no |
| `server/render.yaml` | Render blueprint, small | Deployment prep | Render only |
| `server/requirements.txt` | pinned Python deps, small | Server build/test | pip/Docker |
| `server/tests/test_api.py` | API unit + optional real-engine tests, small | Test | pytest |
| `src/`, `src/cloud/`, `src/engine/` | frontend source dirs | Runtime/test | Vite |
| `src/App.jsx` | game state and orchestration, large | Runtime | `src/main.jsx` |
| `src/CloudSavesPanel.jsx` | local/cloud save/auth UI, small | Runtime | `SettingsPanel.jsx` |
| `src/config.js` | engine/difficulty defaults, small | Runtime | app/layout |
| `src/DashboardLayout.jsx` | main UI, large | Runtime | `App.jsx` |
| `src/engine.js`, `src/engine.test.js` | UCI worker wrapper + tests, medium/small | Runtime/test | App/Vitest |
| `src/engine/engineRouter.js`, `engineRouter.test.js` | routing + fallback tests, small | Runtime/test | App/Vitest |
| `src/engine/remoteEngine.js`, `remoteEngine.test.js` | remote fetch/convert + tests, small | Runtime/test | router/Vitest |
| `src/engine/useEngineServerStatus.js` | health polling hook, small | Runtime | App |
| `src/engineAssets.js` | asset choice/preload, small | Runtime | App/engine |
| `src/EvaluationGraph.jsx` | SVG graph, small | Runtime | Dashboard |
| `src/game.js`, `src/game.test.js` | rules/status/score + tests, small | Runtime/test | App/Vitest |
| `src/hint-positions.test.js` | real Stockfish WASM tactic checks, small | Test | Vitest |
| `src/localGame.js`, `src/localGame.test.js` | pass-play persistence/clocks + tests, small | Runtime/test | App/Vitest |
| `src/main.jsx` | React root/CSS entry, small | Runtime | `index.html` |
| `src/PanelErrorBoundary.jsx` | panel-level boundary, small | Runtime | Dashboard |
| `src/pieces.jsx` | custom SVG chess pieces, small | Runtime | board |
| `src/settings.js`, `src/settings.test.js` | validated preferences + tests, small | Runtime/test | App/Vitest |
| `src/SettingsPanel.jsx` | preferences modal, small | Runtime | Dashboard |
| `src/styles.css` | layout/themes/board styles, large | Runtime | `main.jsx` |
| `src/cloud/savedGames.js`, `savedGames.test.js` | IndexedDB adapter + tests, small | Runtime/test | Cloud panel/Vitest |
| `src/cloud/supabase.js` | conditional browser client, small | Runtime | Cloud panel |
| `vercel.json` | isolation/cache headers, small | Hosting config | Vercel |
| `vite.config.js`, `vitest.config.js` | Vite and jsdom configuration, small | Build/test | Vite/Vitest |
| `docs/PROJECT_OVERVIEW.md` | this report | Docs | no |

**Dead/unused findings:** **VERIFIED:** no app module was positively identified as dead. Vite does not import server/db/docs/scripts. Engine binaries are generated/copied, ignored by Git and served statically. **INFERRED:** Supabase dependency is conditional at runtime but not unused (direct import in `src/cloud/supabase.js`). No dependency proven unused. Screenshot files are documentation artifacts and some are overwritten by visual tests. Python caches/test output are generated/ignored; cache contents not read.

## 3. Architecture

```text
Visitor browser (React static app)
  ├─ chess.js rules/state → react-chessboard + custom SVG pieces
  ├─ Web Worker: Stockfish 19 Lite (opponent default)
  ├─ Web Worker: Stockfish 19 Full (hint/review; Lite fallback)
  ├─ IndexedDB/localStorage
  └─ optional fetch → FastAPI /analyze → native Stockfish in Docker
       └─ optional Supabase JS/session → saved_games table (not accessed)

Vercel: static site/assets + same-origin Node coach function + isolation/cache headers (not deployed/queried)
GitHub Actions: push/PR/manual → server pytest + Docker build; no deploy
```

**VERIFIED:** browser move/state/engine work is in `src/App.jsx`, `src/game.js`, `src/engine.js`; Vercel coach is in `api/coach.js`; local engine API/Docker is in `server/app.py`, `server/Dockerfile`; client and server CI workflows are under `.github/workflows/`. **INFERRED:** Vercel deployment is intended from README/config but was not checked. Browser chess runs on the visitor device; the Vercel function explains supplied facts only; native engine compute runs only where its Docker container is started. No Supabase, Vercel, Fly, Render or Google account was contacted. No hosted server exists.

## 4. Request and data flows

### a) Startup and engine loading
1. `index.html` loads `src/main.jsx`, which mounts `<App/>` and imports CSS.
2. `App.jsx` loads validated local preferences using `src/settings.js`; creates chess.js state.
3. Engine construction is lazy. `getEngine(purpose)` caches separate `play` and `hint` slots. `src/engineAssets.js` selects Lite for standard play, Full for hint/review or Strong play; Full multithread only with cross-origin isolation, capped at 4 threads; otherwise Full single-thread.
4. npm `postinstall` runs `scripts/copy-engine.mjs`, copying pinned package files to ignored `public/engine`. Preload fetches with `force-cache`; `vercel.json` marks `/engine/*` immutable for one year. Full WASM is about 99 MB per build.

### b) Human move
1. Pointer/keyboard/click paths in `App.jsx`/`DashboardLayout.jsx` call `chooseMove`.
2. `src/game.js:makeLegalMove` validates with chess.js. Promotion opens a choice dialog.
3. `chooseMove` updates SAN/FEN, local snapshots/clocks and calls `publishPosition`, incrementing position ID, cancelling old search and clearing hints.
4. AI reply effect requests play search, then applies returned UCI through legal move path. React re-renders board, record, status and evaluation.

### c) Hint
1. `App.jsx:requestHint` captures FEN and position id; uses skill 20, MultiPV 3 and selected 2/4/6 second time; stale IDs are discarded.
2. `src/engine/engineRouter.js:analyzeWithRouter` allows server only for hint/review. Auto uses configured server; Server attempts it; Browser skips it. Disabled/unconfigured Auto uses browser. Remote failure falls back visibly; stale AbortError is not applied.
3. `src/engine/remoteEngine.js:analyzeRemote` health-checks then POSTs FEN/search options, validates response, translates PV, and converts White scores to side-to-move fields.
4. White-perspective values feed evaluation bar/graph; two-player analysis table uses side perspective. See `src/game.js:toWhiteScore`, `remoteEngine.js`, `engine.js`.
5. `DashboardLayout.jsx` renders MultiPV table, Future Moves PV and engine name/depth/thread/hash/nodes/time. App and remote adapter discard stale work.
6. **VERIFIED:** `src/engine/coach.js:analyzeCoachMove` posts structured review facts to same-origin `/api/coach` by default (or the explicit local override), adds a signed-in bearer token when available, and labels the provider. It does not depend on the native engine URL. `api/coach.js:validateRequest` checks FEN, played/best UCI, SAN and each variation sequentially with chess.js. Provider error, timeout, malformed output, quota response or missing key gives a Stockfish-only fallback. `sanitizeExplanation` removes sentences containing move tokens outside the validated engine move set. The fallback does not run a second engine search.

### d) PGN review
`App.jsx:importFinishedPgn` parses one PGN with `Chess.loadPgn`, requires a finished result, replays from initial/header FEN, searches before/after each move (Full, skill 20), and labels white-score loss thresholds: ≥2 pawn blunder, ≥1 mistake, ≥0.5 inaccuracy. `DashboardLayout.jsx` shows table; `EvaluationGraph.jsx` draws SVG. Short searches can fluctuate; these labels are not explanations.

### e) Save/load and sign-in
Without a client, `CloudSavesPanel.jsx` calls `src/cloud/savedGames.js`, using IndexedDB database `chessflow-live`, object store `saved-games`, and localStorage fallback. With `VITE_SUPABASE_URL` plus `VITE_SUPABASE_ANON_KEY`, `src/cloud/supabase.js` creates the only Supabase client via `@supabase/supabase-js`. Panel offers magic link/GitHub, lists user rows, inserts name/FEN/PGN and loads a selected game. RLS/grants are the boundary. No live account/project test performed. No cloud update/delete UI; SQL migration only creates saved games.

### f) Import/export
PGN paste leads to finished-game review; saved row load imports its FEN/PGN. No FEN-list, SAN/UCI, Lichess URL importer or PGN/FEN/JSON/SVG/PNG export handler was found.

### g) Two-player, undo, clocks, draw
`App.jsx` handlers, `src/localGame.js`, and `DashboardLayout.jsx` implement names, orientation, legal alternating moves, optional hints, 5+0/10+0/15+10 clocks, increments, clock history/undo, draw accept/decline, resign and flag results. Playwright coverage: `playwright/two-player.spec.js`.

### h) Theme/settings
`src/settings.js` persists versioned preferences in localStorage. `App.jsx` updates root datasets for effective theme and reduced motion; CSS updates without replacing game state/board. Code supports no board remount on theme changes; no explicit remount-count test was found.

## 5. Engine details

- **VERIFIED version/build:** npm `stockfish@19.0.1`; JS/WASM names `stockfish-19-lite-single`, `stockfish-19-single`, `stockfish-19` (`src/engineAssets.js`, `scripts/copy-engine.mjs`). Native server downloads official Stockfish 19 universal Linux archive and checks SHA-256 (`server/Dockerfile`).
- Opponent defaults to Lite; Standard/Strong selects Lite/Full. Difficulty table (`src/config.js`): Easy 3/200ms; Medium 8/400ms; Hard 14/800ms; Max 20/1500ms. Browser hash default 32 MB (`ENGINE` config); hint default 4000ms, selectable 2000/4000/6000, skill 20, MultiPV 3, PV up to 10 plies.
- Browser Full uses multi-thread build only under cross-origin isolation, thread count 1–4 based on hardware concurrency; otherwise single thread (`src/engineAssets.js`). Server defaults `SF_THREADS=2`, `SF_HASH_MB=128`; request ranges are movetime 100–6000ms, depth 1–24, MultiPV 1–3, skill 0–20 (`server/app.py`).
- Play and hint references are separate worker instances (`App.jsx:getEngine`); per-search UCI resets Skill Level/UCI_LimitStrength/MultiPV (`src/engine.js`). Normal skill settings do not leak across worker slots. Full asset failure uses Lite with visible error; server error falls back to browser with visible reason (`App.jsx`, `engineRouter.js`).

## 6. Server and Docker

**VERIFIED source:** `GET /health` returns ok/engine/threads/hash_mb. `POST /analyze` accepts `fen`, `movetime_ms`, optional `depth`, `multipv`, `skill`; returns best UCI, engine/depth/nodes/time and ranked UCI/SAN/PV/White-score lines. Invalid/finished FEN 400; bad schema/ranges 422; body cap 16 KB; busy engine 503; rate/daily caps 429. Limits: 30 per IP per rolling minute; `DAILY_REQUEST_CAP` default 1000 per process/day, zero disables; counters reset at restart and are not shared. Production requires `ALLOWED_ORIGINS`; app guard returns 403 for unknown Origin (CORS middleware itself is wildcard). Fly client IP and Render forwarded IP trusted only when platform env says so; local forwarded headers ignored. See `server/app.py`.

Dockerfile uses Python 3.12 slim, downloads a pinned Stockfish 19 archive, verifies SHA-256, installs dependencies, runs as UID 10001 and honors `PORT` (8080 default). `scripts/engine-container.mjs` provides build/start/check/stop/logs, container `chessflow-engine`, host port 8090. `server/fly.toml`, `server/render.yaml`, `server/DEPLOY.md`, `.github/workflows/server-ci.yml` are preparation/configuration. Current Fly config has an uncommitted app/region edit and was left untouched. **No hosted server exists or was verified.** No deployment/resource creation occurred.

### Vercel Gemini coach

`api/coach.js` is a separate Node function. It accepts only POST and the strict coach schema, checks `Origin`, bounds the body to 16 KB, validates FEN and every played/best/variation move using chess.js, then sends the validated facts to Gemini. `GEMINI_API_KEY` stays server-side; `GEMINI_MODEL` selects the model. `COACH_REQUIRE_LOGIN` optionally enables Supabase user-token verification with the public URL and anon key. The function applies in-memory per-IP limits; the counters are approximate on serverless instances. A 15-second upstream timeout, bounded JSON output, move-claim filtering and Stockfish-only fallback are implemented. `vercel.json` sets 30 seconds for the function. These files are source/config only; Vercel was not contacted and the function is not deployed. See `docs/coach.md`.

## 7. Database and auth

Full migration (`db/migrations/20261101000000_create_saved_games.sql`):

```sql
create table if not exists public.saved_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  fen text not null check (char_length(fen) <= 100),
  pgn text not null default '' check (char_length(pgn) <= 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_games_user_updated_idx
  on public.saved_games (user_id, updated_at desc);

alter table public.saved_games enable row level security;

drop policy if exists "Users can read their own saved games" on public.saved_games;
create policy "Users can read their own saved games"
  on public.saved_games for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own saved games" on public.saved_games;
create policy "Users can create their own saved games"
  on public.saved_games for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own saved games" on public.saved_games;
create policy "Users can update their own saved games"
  on public.saved_games for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own saved games" on public.saved_games;
create policy "Users can delete their own saved games"
  on public.saved_games for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.saved_games from anon, public;
grant select, insert, update, delete on public.saved_games to authenticated;
```

**VERIFIED SQL summary:** one `saved_games` table: UUID id, owner user UUID, name, FEN, PGN, created/updated timestamps; FK cascades on account delete; name/FEN/PGN constrained by length; index is owner+updated time. RLS on that table. Four authenticated policies (select/insert/update/delete) check row owner equals `auth.uid()`; update checks both old/new row. `anon` and `public` explicitly `REVOKE ALL`; `authenticated` gets select/insert/update/delete. No other grants are specified. No analysis/explanation/pattern tables exist; migration does not cover them. `db/tests/saved_games_rls.test.sql` defines pgTAP isolation assertions, but was not run against a project. User-reported dashboard toggles were not checked. Client auth uses magic link/GitHub and public anon session; no service-role key is referenced by client source.

## 8. UI and design system

Component tree: `main.jsx` → `App` → `DashboardLayout` → `SettingsPanel` → `CloudSavesPanel`; Dashboard owns board (`react-chessboard` + `CHESS_PIECES`), analysis table, evaluation bar, moves, graph, controls and panel error boundaries. Evidence: those named source components.

Light tokens in `src/styles.css` lines 1–49 keep yellow page, cream surface, black outline, 3px border and hard offset shadow. Dark effective-theme tokens around lines 435–493 define `--bg #0A0A14`, `--surface #15162A`, `--surface-2 #181A2E`, `--border #2A2C48`, white text, muted `#A3A5C2`, yellow `#FFC400`, green `#22D95A`, lime `#A5E41A`, amber `#FFB81F`, pink `#FF3B6B`, purple `#6B2EF0`, border 1px, 20px card radius and soft 0 8px 24px shadow. Large blurred indigo/violet shapes are decorative. Board colors are `#D8D5F0` and `#4C35B8`; highlight/piece tokens are in same dark block. Breakpoints: 860px and 560px.

Accessibility: board instructions/keyboard navigation (`DashboardLayout.jsx`); native modal dialog (`SettingsPanel.jsx`); status/live regions; visible focus outlines; reduced motion media query and persisted setting. `playwright/theme-visual.spec.js` audits selected accent and square pairings and both piece colors on both square colors. This does not verify every text/background combination or full WCAG conformance. No axe suite found. Panel-level boundaries wrap board, analysis, graph, not the whole app. Dense mobile layout and glyph-only decorative/status pieces merit a manual screen-reader check.

Visual checks used CSS fallback palette because the reference image was not accessible in this task context. The Playwright screenshot scenario failed before completing when it awaited server-engine identity. Existing historical screenshots were restored after tests overwrote them.

## 9. Testing and quality

| Test file | Coverage |
|---|---|
| `src/engine.test.js` | UCI worker initialization/options/PV/error/cancel. |
| `src/game.test.js` | legal/illegal move, SAN, mate/stalemate, score conversion. |
| `src/hint-positions.test.js` | five real Stockfish WASM tactical positions; logs engine UCI commands/results. |
| `src/localGame.test.js` | turns, draw offer, stale hint, clocks, history validation. |
| `src/settings.test.js` | defaults, invalid/corrupt data, migration, storage failure. |
| `src/cloud/savedGames.test.js` | IndexedDB and localStorage fallback. |
| `src/engine/engineRouter.test.js` | browser route and visible fallback. |
| `src/engine/remoteEngine.test.js` | health/analyze conversion, 503, timeout, stale/malformed result. |
| `src/engine/coach.test.js` | same-origin/default and override routing, bearer token, fallback and cancellation. |
| `api/coach.test.js` | mocked Gemini success/error/timeout, SAN filtering, FEN/line/body/origin/login validation. |
| `playwright/dashboard.spec.js` | responsive layout, piece render, move/AI. |
| `playwright/engine-routing.spec.js` | deterministic mocked server identity/depth and browser fallback. |
| `playwright/engine-routing.live.spec.js` | optional live local-server checks, skipped unless explicitly enabled. |
| `playwright/layout-geometry.spec.js` | light/dark box geometry, 5 viewports, overflow and screenshots. |
| `playwright/settings.spec.js` | settings persistence, dialog/Escape/focus, layout. |
| `playwright/theme-visual.spec.js` | theme screenshots to ignored test output, contrast, piece colors. |
| `playwright/two-player.spec.js` | pass-and-play, persistence, clock/hints, draw/resign. |
| `db/tests/saved_games_rls.test.sql` | pgTAP row ownership assertions; not run. |
| `server/tests/test_api.py` | API validation/CORS/FEN/body/rate/cap/proxy/busy/response; optional real engine. |

**Final verification on 2026-11-02:** `npm.cmd run lint` PASS; `npm.cmd test` PASS, 12 files/52 tests; `npm.cmd run build` PASS, 142 modules, JS 582.19 kB minified (172.66 kB gzip), CSS 49.45 kB (9.12 kB gzip); existing >500 kB chunk warning remains. `npm.cmd run test:smoke -- --workers=1` PASS, 16 passed and 2 live-engine tests skipped (18 total). `python -m pytest -q` in `server/` PASS, 20 passed and 1 skipped with 5 dependency deprecation warnings. The skipped pytest is the optional real-engine test; no Docker engine was needed.

**Smoke-test root causes and fixes:** previous engine-routing checks waited for live server identity without an available server response; the old fixture matched only one fixed local port and the live check was gated on the engine URL itself. The theme visual flow also asserted server identity, coupling screenshots to a running server. Default fixtures now mock `/health` and `/analyze` across hosts, default health is offline so ordinary tests use browser Stockfish, and live checks are isolated in `playwright/engine-routing.live.spec.js` behind explicit flags. Theme screenshots now go to ignored `test-results/`; the new layout screenshots use unique `docs/screenshots/` names. The review test now follows the actual Stockfish best move instead of assuming one fixed move.

Lint is ESLint 9 flat config with `no-undef`, `react/jsx-no-undef`, JS/JSX browser+node globals, excluding build/assets/test artifacts (`eslint.config.js`). `.github/workflows/client-ci.yml` runs npm ci, lint, unit tests, build and deterministic Playwright without secrets/deployment; `.github/workflows/server-ci.yml` retains pytest and Docker build. Coverage gaps: no multi-game PGN/error/size tests; no live Gemini/Vercel function test; no Supabase UI/auth integration or live RLS test; no deployment validation; no exhaustive accessibility/mobile performance testing.

## 10. Security and privacy review

- **VERIFIED:** `.gitignore` excludes `.env*` except `.env.example`; browser `VITE_` values are build-time/public. Names used: `VITE_ENGINE_API_URL`, `VITE_ENGINE_SERVER_ENABLED`, `VITE_COACH_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Gemini calls go through `api/coach.js`; `GEMINI_API_KEY` is read server-side only. Supabase anon key is public by design; RLS must protect rows. Key contents were not read.
- **VERIFIED:** server validates Origin, request size, schema/ranges and FEN; serializes engine; per-IP and daily caps exist (`server/app.py`). Daily count resets at process restart and is per-instance, not a global quota. CORS middleware allows wildcard but application guard checks allowlist; origin is not authentication.
- **VERIFIED:** PGN is parsed by chess.js and UI values rendered as React text; no `dangerouslySetInnerHTML` found. No explicit PGN size cap was found in review path. Stockfish WASM comes from pinned npm package/static assets; Gemini coach facts are sent only when requesting a coach explanation (`src/engine/coach.js`, `api/coach.js`).
- **Data leaving device:** **VERIFIED from source:** browser-only chess calculations remain local. When requesting Gemini coaching, the browser sends supplied FEN, played/best move, validated engine lines/evaluations/PVs, and user level to same-origin `/api/coach` by default; Vercel forwards that structured prompt to Google. When configured for the optional local engine, hint/review requests send FEN/search settings to that server. Signed-in cloud saves send game fields and auth requests to Supabase. Hosting access logs were not examined.

| Severity | Concrete risk |
|---|---|
| Medium | Coach/API abuse limits are in-memory/per-instance, not a global quota or billing guarantee (`api/coach.js`, `server/app.py`). No hosted coach deployment verified. |
| Medium | An allowed-origin compromise can call API; CORS/Origin does not authenticate (`server/app.py`). |
| Medium | Actual Supabase project settings/policies were not queried; SQL is owner-scoped but deployed state unverified. |
| Medium | Full WASM builds each about 99 MB; mobile load, cache/bandwidth and hosting limits (`public/engine`, `src/engineAssets.js`). |
| Low | Cloud auth/list async calls have limited error/mount cancellation handling (`src/CloudSavesPanel.jsx`). |
| Low | Unbounded review PGN may cause local parse/search work (`App.jsx:importFinishedPgn`). |

No secret contents were read or included. No external account/project was contacted.

## 11. Bugs and technical debt

- **VERIFIED:** production main JS bundle is 582.19 kB minified and triggers >500 kB warning (`npm.cmd run build`, 2026-11-02).
- **VERIFIED:** Full Stockfish single and multi-thread WASM each about 99 MB (`public/engine`, `engineAssets.js`).
- **VERIFIED:** deterministic browser suite now passes with explicit mock engine routes; live local-engine browser tests remain separately gated. GitHub Actions has not been run remotely.
- **VERIFIED:** server pytest passes locally: 20 passed, 1 optional real-engine test skipped; Docker runtime was not needed for that suite.
- **VERIFIED:** error boundaries wrap selected panels, not app root (`PanelErrorBoundary.jsx`, `DashboardLayout.jsx`). A root render error can still blank app.
- **VERIFIED:** server daily limits are volatile/in-process (`server/app.py`).
- **INFERRED:** absence of export, multi-game import, Library, pattern detection and explanations means users cannot perform those workflows in current UI; no unsupported message is guaranteed.
- **INFERRED:** long PGN and constrained mobile devices may affect performance; no benchmark run.

## 12. Operations guide (PowerShell)

Prerequisites: Node per README (20.19+ or 22.12+); Docker Desktop for local native API; Python 3.12 + Stockfish executable for direct server run. Private local environment file is gitignored and deliberately not shown. Env variable names only: `VITE_ENGINE_API_URL`, `VITE_ENGINE_SERVER_ENABLED`, `VITE_COACH_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `ALLOWED_ORIGINS`, `COACH_REQUIRE_LOGIN`, `SF_THREADS`, `SF_HASH_MB`, `DAILY_REQUEST_CAP`, `PORT`, `STOCKFISH_PATH`, `LOG_LEVEL`, `ENVIRONMENT`, `RUN_LIVE_ENGINE_TESTS`, `RUN_LIVE_ENGINE_STOPPED_TESTS`.

```powershell
# Client
npm install
npm run dev
npm run lint
npm test
npm run build
npm run test:smoke

# Local Docker engine, from repository root (Docker Desktop must run)
npm run engine:build
npm run engine:start
npm run engine:check
npm run engine:logs
npm run engine:stop

# Direct server, from server folder
Set-Location server
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
$env:STOCKFISH_PATH = 'C:\path\to\stockfish.exe'
$env:ALLOWED_ORIGINS = 'http://localhost:5173'
uvicorn app:app --host 0.0.0.0 --port 8080
```

Vercel static deployment steps exist in `README.md`, but no hosting action occurred. If the owner later chooses deployment, public client configuration belongs in Vercel build environment and changes require rebuild. Never put service-role credentials in client variables. Rotate credentials at their provider, then update appropriate environment and rebuild client if it is a Vite value. App backup/export is not implemented; local saves depend on browser storage. Supabase provider backup settings were not inspected.

## 13. Recommended next steps

| Priority | Work | Effort | Value | Risk |
|---|---|---:|---|---|
| 1 | Add and verify the Vercel environment configuration manually, then test coaching on the deployed site | S | High | Medium |
| 2 | Add durable distributed abuse controls before exposing the coach broadly | M | High | Medium |
| 3 | Implement PGN/FEN/JSON and image export plus backup tests | M | High | Low |
| 4 | Add a Library page and cloud adapter integration tests | M | Medium | Medium |
| 5 | Reduce engine asset load and main bundle size | M/L | High | Medium |
| 6 | Implement supported pattern detection and personalized learning with engine evidence | L | Medium | Medium |

**Do not do yet:** do not host the Docker engine or create Fly/Render resources; do not touch Vercel/Supabase/Google Cloud until you choose to configure them; do not treat in-memory limits as billing guarantees; do not put service-role keys in the browser; do not advertise missing export/pattern/Library workflows as implemented. The Gemini coach route exists in code but is not deployed or live-verified.

## Commands run and results

| Command | Result |
|---|---|
| `git status --short --branch`, `git log -6 --oneline` | **VERIFIED:** inspected locally; final logical commits are reported in chat. No push. |
| `npm.cmd run lint` | **PASS**, exit 0 after each implementation part and at final verification. |
| `npm.cmd test` | **PASS:** 12 test files, 52 tests. |
| `npm.cmd run build` | **PASS:** 142 modules; JS 582.19 kB / 172.66 kB gzip; CSS 49.45 kB / 9.12 kB gzip; >500 kB chunk warning. |
| `npm.cmd run test:smoke -- --workers=1` with both live flags disabled | **PASS:** 16 passed, 2 live-engine tests skipped (18 total). Includes layout geometry, themes, move navigation, PGN review, coaching controls and two-player coverage. |
| `python -m pytest -q` from `server/` | **PASS:** 20 passed, 1 optional real-engine test skipped; five dependency deprecation warnings. |
| Official provider documentation lookup | **VERIFIED:** provider details are summarized in `docs/coach.md`; limits and model availability can change. |
| Vercel, Supabase, Fly, Render, Google Cloud or live Gemini API commands | **Not run by instruction.** |

The Vercel function max duration is set to 30 seconds. Official Vercel docs currently describe Hobby max duration up to 60 seconds without Fluid Compute and 300 seconds with it; check the project's current plan/config before relying on deployment. The current Gemini model list includes `gemini-3.5-flash-lite`; pricing docs list free-tier input/output but quotas and free-tier eligibility can change. These details are marked “verify before relying” in `docs/coach.md`. No hosted function, Google API call, Supabase project, Docker runtime or remote CI run was verified.

## How the whole thing works

A player opens the site and the browser checks chess moves, draws the board and runs Stockfish on that device. When the player asks for coaching, the app sends already-computed engine facts through a Vercel function to Gemini; if that service is unavailable, the app shows Stockfish-only guidance. Games and settings can stay in browser storage; optional account-based saves need Supabase configuration. The Docker chess engine remains for local use only, and no hosting or cloud project was accessed.
