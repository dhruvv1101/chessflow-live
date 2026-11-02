# Chess.com public-game import

Chess.com import reads public games through the Published-Data API. It is not a
login or identity check: a username does not prove that the visitor owns that
account. The UI says this before any request is made.

## How it works

- The default mode is `proxy`. The browser calls this site's `api/chesscom.js`
  Vercel function, which makes a GET request to the public Chess.com API with a
  descriptive User-Agent. The username is sent to Chess.com through this site
  function. No games are stored on the server.
- The optional `VITE_CHESSCOM_MODE=direct` mode calls Chess.com from the
  browser. A one-time browser check on 2026-11-02 succeeded: the archives URL
  returned HTTP 200 and `application/json; charset=utf-8` readable by the
  page. CORS behaviour can change, so proxy mode remains the default.
- Requests are sequential: first the archive list, then the newest month, then
  one older month per user action. Only `rules: "chess"` games are retained;
  variant games are counted and reported.
- Older monthly archives are immutable and can use ETag/session caches. The
  current month is revalidated. HTTP 429 responses use bounded retries and
  honour `Retry-After` when present. The proxy has best-effort per-IP throttling
  and a 10-second upstream timeout. Its in-memory throttle is approximate in a
  serverless environment.
- Profile URLs must be Chess.com member URLs. Game links are displayed only
  when they are HTTPS links on `chess.com` or `www.chess.com`; external links
  use `noopener noreferrer`. API fields are rendered as text, not HTML.
- Analyze imports the PGN into the existing Stockfish review flow. Save uses
  the existing IndexedDB/Supabase adapter. The client does not persist game
  responses in server storage.
- The optional batch action to scan up to ten games for recurring mistakes is
  not implemented; games must be analyzed individually.

## Vercel configuration

Set `CHESSCOM_CONTACT` as a **server-only** Vercel environment variable. Use a
contact value suitable for the API User-Agent; never add the value to source,
the browser environment, or a commit. Then deploy/redeploy from your normal
Vercel workflow. `VITE_CHESSCOM_MODE` is optional; it is a public build-time
setting and defaults to `proxy`.

`ALLOWED_ORIGINS` can list the browser origins allowed to call the proxy. When
unset, the function uses the production site's configured default origin.
The function accepts only GET requests for the archive list and monthly-games
endpoints, validates usernames and query fields, forwards only `If-None-Match`,
and caps upstream response bodies at 3 MiB.

## Etiquette and limits

Load only the months you need, avoid repeated refreshes, and wait before
retrying after a 429 or 403. The client retries at most twice for 429s. The
proxy limits requests per IP in memory; serverless instances do not share a
reliable global counter. Verify Chess.com's current API terms and usage
guidance before relying on this feature: [Published-Data API information](https://www.chess.com/news/view/published-data-api) and [Chess.com User Agreement](https://www.chess.com/legal/user-agreement).

## Environment variable names

- `CHESSCOM_CONTACT` — server-only Vercel contact included in the proxy
  User-Agent. Required for proxy requests.
- `VITE_CHESSCOM_MODE` — optional public build setting: `proxy` (default) or
  `direct`.

