# Gemini Coach

The app calculates chess facts in the browser with Stockfish. The Vercel
function at `api/coach.js` receives those facts, validates the FEN and every
UCI/SAN move against `chess.js`, then asks Gemini to explain only the supplied
engine lines. It never runs chess analysis itself. If Gemini is unavailable,
the function returns a Stockfish-only explanation and a fallback flag.

## Vercel setup

In the Vercel project’s environment settings, add these server-side variables:

- `GEMINI_API_KEY` — a Gemini Developer API key; do not use a `VITE_` name.
- `GEMINI_MODEL` — optional model selection. The current model and free-tier
  notes below are **verify before relying**.
- `ALLOWED_ORIGINS` — comma-separated allowed browser origins. If omitted, the
  function only allows `https://chessflow-live.vercel.app`.
- `COACH_REQUIRE_LOGIN` — optional; when enabled, a signed-in user is required.
  When enabled, the function verifies the bearer token using the Supabase URL
  and public anon key from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
  No service-role key is used.

The browser calls `/api/coach` on the same origin. `VITE_COACH_URL` can override
the endpoint for local development; for the existing Docker API, set it to the
local server’s `/api/coach/analyze` URL. This setting is independent of
`VITE_ENGINE_API_URL`. The client adds the signed-in Supabase access token when
one is available. A `login_required` response displays a sign-in message and
still shows the Stockfish-only explanation.

The function rejects non-POST requests, unknown fields, bodies over 16 KB,
invalid FENs, illegal played moves and illegal variation lines. It uses
in-memory limits of 12 requests per IP per minute and 120 per IP per UTC day.
**These in-memory counters on serverless are approximate**: concurrent
instances and cold starts have separate counters, so these limits are abuse
friction, not a hard global quota.

The Gemini request is bounded to 15 seconds and 900 output tokens. It requests
JSON, limits output size, and removes sentences that contain SAN/UCI tokens
outside the validated engine move set. The displayed punishment line is copied
from the supplied Stockfish line. Treat generated prose as coaching language;
Stockfish remains the source of chess calculations.

## Current platform and model notes

Checked against official docs on 2026-11-02. **Verify before relying**; model
availability, free-tier eligibility and quotas can change and may differ by
Google project or region.

- The current Gemini models list includes `gemini-3.5-flash-lite`; the pricing
  page currently lists its text input and output as free of charge on the free
  tier. That is not a promise of unlimited use. Check the project’s live rate
  limits and AI Studio availability before relying on it.
- The same pricing page says free-tier prompts/responses may be used to improve
  Google products. Do not send private game notes or personal information.
- Official references: [Gemini models](https://ai.google.dev/gemini-api/docs/models),
  [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing), and
  [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).
- Vercel’s Hobby plan documents a 10-second default and up to 60 seconds when
  Fluid Compute is not enabled; Fluid Compute documentation lists 300 seconds
  as the Hobby maximum. This function is configured for 30 seconds in
  `vercel.json`, below either documented maximum. Verify the active project
  settings before relying on a specific plan limit. See [Vercel function
  duration](https://vercel.com/docs/functions/configuring-functions/duration)
  and [Hobby plan limits](https://vercel.com/docs/plans/hobby).

## Local development

The Docker FastAPI server remains available for local testing. Set `GEMINI_API_KEY`
in the container’s environment and point `VITE_COACH_URL` at its coach endpoint
to use Gemini locally. Do not put a Gemini key in a `VITE_` variable. With no
coach endpoint or key, browser chess play and Stockfish analysis continue to
work, and the interface labels the source as “Coach: Stockfish analysis only.”
