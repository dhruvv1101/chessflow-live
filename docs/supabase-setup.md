# Supabase cloud saved games

Supabase is the recommended cloud option for saved games. The app remains playable without Supabase; local browser saves continue to work. The cloud adapter stores a user's saved game FEN/PGN in `public.saved_games`. Row Level Security (RLS) restricts every row to its owner.

## 1. Create a project

Create a Supabase project in the Supabase dashboard and choose a database password. Do not put that password in this repository or in client environment variables.

## 2. Create the table and policies

Open **SQL Editor → New query** and run [`db/migrations/20261101000000_create_saved_games.sql`](../db/migrations/20261101000000_create_saved_games.sql). It enables RLS, grants table access only to the `authenticated` role, and adds owner policies for select, insert, update, and delete.

To run the ownership test, enable the `pgtap` database extension, then execute [`db/tests/saved_games_rls.test.sql`](../db/tests/saved_games_rls.test.sql) against the project database using the Supabase CLI `supabase test db` (with the SQL test path) or a PostgreSQL client with pgTAP installed. It creates two test identities inside a transaction and verifies user A sees their row but sees zero rows for user B. The test rolls back its fixtures.

## 3. Enable sign-in methods

In **Authentication → Providers**, enable **Email** and configure magic links in the email template. Enable **GitHub** and add the OAuth Client ID and Client Secret from your GitHub OAuth app in the Supabase dashboard. Those provider credentials belong only in the Supabase dashboard.

In **Authentication → URL Configuration**, set:

- **Site URL:** your production Vercel domain, for example `https://chessflow-live.vercel.app`.
- **Redirect URLs:** the production Vercel domain (for example `https://chessflow-live.vercel.app/**`) and local dev (`http://localhost:5173/**`). If you use preview deployments, add their exact domains/patterns as needed.

## 4. Configure Vercel

In the Vercel project **Settings → Environment Variables**, add the values from Supabase **Project Settings → API**:

- `VITE_SUPABASE_URL` = Project URL
- `VITE_SUPABASE_ANON_KEY` = anon/public key

Select the environments you intend to use, save, and redeploy the client. The anon key is designed to be public in a browser; RLS is the security boundary. Never use a service-role key in client code or the AI route. This application does not require a service-role key.

For local development, place those two values in `.env.local`. That file is ignored by git. Restart Vite after changing environment variables.

## Use cloud saves

Open **Settings → Cloud saves**, sign in by magic link or GitHub, then save the current game. The saved game list is fetched through the signed-in user's Supabase session and protected by the same RLS policies. Select a save to load it into the active board. Without the two Vite variables, this section explains how to enable it and the rest of the app remains local-only.
