# Sign-in setup

ChessFlow uses Supabase Auth for optional cloud saves and, when enabled on the
server, the Gemini coach. Local play and Stockfish-only analysis remain
available without signing in.

## GitHub sign-in

1. In GitHub, create an OAuth App. Set **Homepage URL** to the production site
   origin. Set **Authorization callback URL** to
   `<Supabase project URL>/auth/v1/callback`.
2. In Supabase open **Authentication → Sign In / Providers → GitHub** and enable
   the provider. Add the OAuth App client ID and client secret in that
   provider's settings.
3. In Supabase **Authentication → URL Configuration**, set **Site URL** to the
   production site origin. Add the production origin and
   `http://localhost:5173/**` to **Redirect URLs**.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the client build
   environment. These are public browser configuration values; never put a
   service-role key in the client.

## Email magic links

Enable **Email** under **Authentication → Sign In / Providers**. Supabase's
default email service is limited to project-team recipients and a low send
rate; its current message/hour limits must be **verified before relying**.
For general users, configure a custom SMTP provider in the Supabase Auth email
settings, verify its current sending limits and pricing before relying on it,
and test delivery and redirect URLs. The app maps provider-disabled, rate-limit,
unauthorized-address, and network failures to plain messages without showing
raw provider responses.

## Optional provider switches

The client build can hide individual buttons with `VITE_AUTH_GITHUB_ENABLED`
or `VITE_AUTH_EMAIL_ENABLED` set to `false`. Google is hidden by default and
can be shown with `VITE_AUTH_GOOGLE_ENABLED` set to `true`; enable and configure
Google in Supabase before exposing its button. These are UI switches only and
do not enable a provider in Supabase.

After OAuth or an email callback, the app confirms the signed-in account and
removes auth callback query/hash data from the address bar. If the session has
expired, sign in again. Sign out is available beside the account identity in
Settings → Cloud saves.

Provider availability and all provider sending limits: **verify before
relying** in the current Supabase dashboard and provider documentation.
