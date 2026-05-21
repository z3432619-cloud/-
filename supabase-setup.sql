create table if not exists public.doudizhu_scores (
  player_name text primary key,
  games integer not null default 0,
  wins integer not null default 0,
  streak integer not null default 0,
  best_streak integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint player_name_length check (char_length(player_name) between 2 and 16),
  constraint stats_not_negative check (
    games >= 0
    and wins >= 0
    and streak >= 0
    and best_streak >= 0
    and wins <= games
  )
);

alter table public.doudizhu_scores enable row level security;

drop policy if exists "public read scores" on public.doudizhu_scores;
create policy "public read scores"
on public.doudizhu_scores
for select
to anon
using (true);

drop policy if exists "public insert scores" on public.doudizhu_scores;
create policy "public insert scores"
on public.doudizhu_scores
for insert
to anon
with check (
  char_length(player_name) between 2 and 16
  and games >= 0
  and wins >= 0
  and streak >= 0
  and best_streak >= 0
  and wins <= games
);

drop policy if exists "public update scores" on public.doudizhu_scores;
create policy "public update scores"
on public.doudizhu_scores
for update
to anon
using (true)
with check (
  char_length(player_name) between 2 and 16
  and games >= 0
  and wins >= 0
  and streak >= 0
  and best_streak >= 0
  and wins <= games
);
