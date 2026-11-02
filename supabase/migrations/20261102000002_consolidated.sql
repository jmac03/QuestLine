-- QuestLine consolidated database migration
-- Run this file once on a database that already has Supabase Auth and the
-- existing reward tables (reward_tracks, reward_track_milestones,
-- user_reward_track_progress, user_reward_track_selections, and
-- user_reward_grants).
--
-- This includes the final form of every migration currently in this repository.
-- Number Roll is intentionally reset: its players/history are deleted and
-- recreated. Reward/account tables are not deleted.

-- ============================================================
-- Song reward grant helper
-- ============================================================

-- Fix the song reward grant helper for schemas where milestone_id is required
-- on user_reward_grants. This migration is for databases that already applied
-- 20261019000001_song_reward_grants.sql.

drop function if exists public.grant_song_reward(uuid, uuid, text, text);

create or replace function public.grant_song_reward(
  p_user_id uuid,
  p_track_id uuid,
  p_reward_name text,
  p_song_id text,
  p_milestone_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_grant_id uuid;
begin
  if p_user_id is null or p_track_id is null or p_milestone_id is null then
    raise exception 'A user ID, track ID, and milestone ID are required';
  end if;

  if p_reward_name is null or btrim(p_reward_name) = '' then
    raise exception 'A reward name is required';
  end if;

  if p_song_id is null or btrim(p_song_id) = '' then
    raise exception 'A song ID is required';
  end if;

  insert into public.user_reward_grants (
    user_id,
    milestone_id,
    track_id,
    reward_name,
    reward_payload
  )
  values (
    p_user_id,
    p_milestone_id,
    p_track_id,
    p_reward_name,
    jsonb_build_object(
      'type', 'song',
      'song_id', p_song_id
    )
  )
  returning id into new_grant_id;

  return new_grant_id;
end;
$$;

revoke all on function public.grant_song_reward(uuid, uuid, text, text, uuid) from public;
revoke all on function public.grant_song_reward(uuid, uuid, text, text, uuid) from anon;
revoke all on function public.grant_song_reward(uuid, uuid, text, text, uuid) from authenticated;
grant execute on function public.grant_song_reward(uuid, uuid, text, text, uuid) to service_role;



-- ============================================================
-- Account-row RLS
-- ============================================================

-- Account-owned rows must never be readable by anon or by another user.
-- Service-role reward/grant jobs bypass RLS; the client only needs SELECT.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'user_reward_grants',
    'user_reward_track_progress',
    'user_reward_track_selections'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('revoke insert, update, delete on table public.%I from anon, authenticated', table_name);
      execute format('grant select on table public.%I to authenticated', table_name);
      begin
        execute format(
          'create policy questline_read_own_%I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
          table_name, table_name
        );
      exception
        when duplicate_object then null;
      end;
    end if;
  end loop;
end $$;



-- ============================================================
-- Clean Number Roll reset and final RPCs
-- ============================================================

-- Number Roll redesign.
--
-- The game is split into three responsibilities:
--   1. number_roll_result(integer) is a pure, deterministic evaluator.
--   2. roll_number(uuid) owns authentication, energy, idempotency, and storage.
--   3. get_roll_state() is the read model used by the browser.
--
-- This migration is intentionally destructive for the Number Roll subsystem.
-- It removes only Number Roll objects; account, reward, and song tables are not
-- touched. Apply it after the original Number Roll migration.

drop function if exists public.get_roll_state() cascade;
drop function if exists public.roll_number(uuid) cascade;
drop function if exists public.number_roll_result(integer) cascade;
drop table if exists public.number_rolls cascade;
drop table if exists public.number_roll_players cascade;

create table public.number_roll_players (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_energy integer not null default 10 check (current_energy >= 0),
  max_energy integer not null default 10 check (max_energy > 0),
  total_score bigint not null default 0 check (total_score >= 0),
  best_score integer not null default 0 check (best_score >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.number_rolls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  roll_value integer not null check (roll_value between 1 and 1000),
  score_gain integer not null check (score_gain >= 0),
  rarity text not null check (rarity in ('Common', 'Uncommon', 'Rare', 'Epic')),
  badges jsonb not null default '[]'::jsonb check (jsonb_typeof(badges) = 'array'),
  created_at timestamptz not null default now(),
  unique (user_id, request_id)
);

create index number_rolls_user_created_at_idx
  on public.number_rolls (user_id, created_at desc);

alter table public.number_roll_players enable row level security;
alter table public.number_rolls enable row level security;
revoke all on table public.number_roll_players from anon, authenticated;
revoke all on table public.number_rolls from anon, authenticated;

create or replace function public.number_roll_result(p_roll integer)
returns jsonb
language plpgsql
immutable
parallel safe
set search_path = public
as $$
declare
  digits text;
  reversed_digits text;
  is_prime boolean := true;
  divisor integer;
  score_gain integer := 0;
  result_badges jsonb := '[]'::jsonb;
  result_rarity text;
begin
  if p_roll is null or p_roll < 1 or p_roll > 1000 then
    raise exception 'roll must be between 1 and 1000';
  end if;

  digits := p_roll::text;
  reversed_digits := reverse(digits);

  if p_roll > 1 then
    divisor := 2;
    while divisor * divisor <= p_roll loop
      if p_roll % divisor = 0 then
        is_prime := false;
        exit;
      end if;
      divisor := divisor + 1;
    end loop;
  else
    is_prime := false;
  end if;

  if is_prime then
    score_gain := score_gain + 100;
    result_badges := result_badges || '["prime"]'::jsonb;
  end if;

  if digits = reversed_digits then
    score_gain := score_gain + 80;
    result_badges := result_badges || '["palindrome"]'::jsonb;
  end if;

  if p_roll % 2 = 0 then
    score_gain := score_gain + 20;
    result_badges := result_badges || '["even"]'::jsonb;
  else
    score_gain := score_gain + 20;
    result_badges := result_badges || '["odd"]'::jsonb;
  end if;

  if length(digits) > 1
     and substring(digits from 1 for 1) = substring(digits from 2 for 1)
     and substring(digits from 2) = repeat(substring(digits from 2 for 1), length(digits) - 1) then
    score_gain := score_gain + 60;
    result_badges := result_badges || '["repeating_digits"]'::jsonb;
  end if;

  if p_roll = 7 or p_roll = 42 or p_roll = 777 then
    score_gain := score_gain + 50;
    result_badges := result_badges || '["lucky_number"]'::jsonb;
  end if;

  if p_roll >= 900 then
    score_gain := score_gain + 150;
    result_badges := result_badges || '["high_roller"]'::jsonb;
  elsif p_roll <= 100 then
    score_gain := score_gain + 40;
    result_badges := result_badges || '["low_ball"]'::jsonb;
  end if;

  result_rarity := case
    when score_gain >= 250 then 'Epic'
    when score_gain >= 150 then 'Rare'
    when score_gain >= 80 then 'Uncommon'
    else 'Common'
  end;

  return jsonb_build_object(
    'roll', p_roll,
    'scoreGain', score_gain,
    'rarity', result_rarity,
    'badges', result_badges
  );
end;
$$;

-- Replace the state-changing implementation so all scoring is defined in one
-- place. The signature is unchanged for backwards compatibility.
create or replace function public.roll_number(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  player public.number_roll_players;
  prior_roll public.number_rolls;
  roll_value integer;
  evaluated jsonb;
  score_gain integer;
  roll_rarity text;
  roll_badges jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  if p_request_id is null then
    raise exception 'p_request_id is required';
  end if;

  insert into public.number_roll_players (user_id)
  values (auth.uid())
  on conflict (user_id) do nothing;

  select * into player
    from public.number_roll_players
   where user_id = auth.uid()
   for update;

  select * into prior_roll
    from public.number_rolls
   where user_id = auth.uid() and request_id = p_request_id;

  if found then
    return jsonb_build_object(
      'roll', prior_roll.roll_value,
      'scoreGain', prior_roll.score_gain,
      'rarity', prior_roll.rarity,
      'badges', prior_roll.badges,
      'canRoll', player.current_energy > 0,
      'currentEnergy', player.current_energy,
      'maxEnergy', player.max_energy,
      'totalScore', player.total_score,
      'bestScore', player.best_score
    );
  end if;

  if player.current_energy < 1 then
    raise exception 'No energy available';
  end if;

  roll_value := floor(random() * 1000 + 1)::integer;
  evaluated := public.number_roll_result(roll_value);
  score_gain := (evaluated ->> 'scoreGain')::integer;
  roll_rarity := evaluated ->> 'rarity';
  roll_badges := evaluated -> 'badges';

  update public.number_roll_players
     set current_energy = current_energy - 1,
         total_score = total_score + score_gain,
         best_score = greatest(best_score, score_gain),
         updated_at = now()
   where user_id = auth.uid()
   returning * into player;

  insert into public.number_rolls (user_id, request_id, roll_value, score_gain, rarity, badges)
  values (auth.uid(), p_request_id, roll_value, score_gain, roll_rarity, roll_badges);

  return evaluated || jsonb_build_object(
    'canRoll', player.current_energy > 0,
    'currentEnergy', player.current_energy,
    'maxEnergy', player.max_energy,
    'totalScore', player.total_score,
    'bestScore', player.best_score
  );
end;
$$;

create or replace function public.get_roll_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  player public.number_roll_players;
  recent_rolls jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  insert into public.number_roll_players (user_id)
  values (auth.uid())
  on conflict (user_id) do nothing;

  select * into player
    from public.number_roll_players
   where user_id = auth.uid();

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'roll_value', roll_value,
      'score_gain', score_gain,
      'rarity', rarity,
      'badges', badges
    ) order by created_at desc
  ), '[]'::jsonb)
    into recent_rolls
    from (
      select roll_value, score_gain, rarity, badges, created_at
        from public.number_rolls
       where user_id = auth.uid()
       order by created_at desc
       limit 5
    ) rolls;

  return jsonb_build_object(
    'currentEnergy', player.current_energy,
    'maxEnergy', player.max_energy,
    'totalScore', player.total_score,
    'bestScore', player.best_score,
    'canRoll', player.current_energy > 0,
    'recentRolls', recent_rolls
  );
end;
$$;

revoke all on function public.number_roll_result(integer) from public, anon, authenticated;
grant execute on function public.number_roll_result(integer) to authenticated;
revoke all on function public.get_roll_state() from public, anon;
grant execute on function public.get_roll_state() to authenticated;
revoke all on function public.roll_number(uuid) from public, anon;
grant execute on function public.roll_number(uuid) to authenticated;



