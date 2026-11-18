-- Guest Wordle runs are claimed once per run UUID.
create table if not exists public.wordle_guest_score_claims (
  run_id uuid primary key,
  claimed_by uuid not null references auth.users(id) on delete cascade,
  score integer not null check (score between 0 and 1000),
  created_at timestamptz not null default now()
);

alter table public.wordle_guest_score_claims enable row level security;
revoke all on table public.wordle_guest_score_claims
  from public, anon, authenticated;

-- Required for the function's ON CONFLICT target.
create unique index if not exists user_reward_grants_user_milestone_uidx
  on public.user_reward_grants (user_id, milestone_id);

create or replace function public.claim_wordle_guest_score(
  p_run_id uuid,
  p_score integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_track_id uuid;
  v_score_step bigint;
  v_points_per_marker integer;
  v_previous_points bigint;
  v_score_remainder bigint;
  v_total_score numeric;
  v_points_earned bigint := 0;
  v_new_points bigint;
  v_new_remainder bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;

  if p_run_id is null then
    raise exception 'p_run_id is required';
  end if;

  if p_score is null or p_score not between 0 and 1000 then
    raise exception 'Invalid score';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_run_id::text, 0)
  );

  if exists (
    select 1
    from public.wordle_guest_score_claims
    where run_id = p_run_id
  ) then
    return pg_catalog.jsonb_build_object(
      'runId', p_run_id,
      'score', p_score,
      'alreadyClaimed', true,
      'rewardPoints', 0
    );
  end if;

  insert into public.wordle_guest_score_claims (run_id, claimed_by, score)
  values (p_run_id, v_user_id, p_score);

  select s.track_id, t.score_step, t.points_per_score_milestone
    into v_track_id, v_score_step, v_points_per_marker
    from public.user_reward_track_selections as s
    join public.reward_tracks as t
      on t.id = s.track_id
     and t.is_active
   where s.user_id = v_user_id
   for share of s, t;

  if v_track_id is not null and p_score > 0 then
    insert into public.user_reward_track_progress (
      user_id, track_id, points, last_score_marker
    )
    values (v_user_id, v_track_id, 0, 0)
    on conflict (user_id, track_id) do nothing;

    select points, score_remainder
      into v_previous_points, v_score_remainder
      from public.user_reward_track_progress
     where user_id = v_user_id
       and track_id = v_track_id
     for update;

    -- Numeric intermediate avoids bigint overflow when adding score to remainder.
    v_total_score := v_score_remainder::numeric + p_score::numeric;

    v_points_earned :=
      pg_catalog.floor(v_total_score / v_score_step)::bigint
      * v_points_per_marker;

    v_new_remainder :=
      pg_catalog.mod(v_total_score, v_score_step)::bigint;

    v_new_points := v_previous_points + v_points_earned;

    update public.user_reward_track_progress
       set points = v_new_points,
           score_remainder = v_new_remainder,
           last_score_marker = last_score_marker + p_score,
           updated_at = now()
     where user_id = v_user_id
       and track_id = v_track_id;

    insert into public.user_reward_grants (
      user_id, milestone_id, track_id, reward_name, reward_payload
    )
    select v_user_id, m.id, m.track_id, m.name, m.reward_payload
      from public.reward_track_milestones as m
     where m.track_id = v_track_id
       and m.points_required <= v_new_points
    on conflict (user_id, milestone_id) do nothing;
  end if;

  return pg_catalog.jsonb_build_object(
    'runId', p_run_id,
    'score', p_score,
    'alreadyClaimed', false,
    'rewardPoints', v_points_earned
  );
end;
$$;

revoke all on function public.claim_wordle_guest_score(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_wordle_guest_score(uuid, integer)
  to authenticated;