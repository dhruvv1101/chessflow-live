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
