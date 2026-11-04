-- Typing Sprint rounds and reward-track integration.
--
-- The client submits a completed run to complete_typing_round().
-- The function derives the typing metrics, stores the result, and applies
-- the score to the user's currently selected active reward track.
--
-- Prerequisite: the reward-track tables used below must already exist:
--   public.reward_tracks
--   public.reward_track_milestones
--   public.user_reward_track_selections
--   public.user_reward_track_progress
--   public.user_reward_grants

create table if not exists public.typing_sprint_rounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  duration_seconds integer not null
    check (duration_seconds in (15, 30, 60)),
  prompt_pack text not null
    check (prompt_pack in ('sentences', 'words')),
  prompt text not null
    check (char_length(prompt) between 1 and 10000),
  typed_text text not null
    check (char_length(typed_text) between 0 and 10000),
  elapsed_ms integer not null
    check (elapsed_ms between 0 and 3600000),
  typed_characters integer not null
    check (typed_characters >= 0),
  correct_characters integer not null
    check (correct_characters >= 0),
  wpm integer not null
    check (wpm >= 0),
  accuracy numeric(5, 2) not null
    check (accuracy between 0 and 100),
  score integer not null
    check (score between 0 and 500),
  applied_track_id uuid references public.reward_tracks(id),
  reward_points bigint,
  created_at timestamptz not null default now(),
  unique (user_id, request_id)
);

-- Also supports installations where the rounds table was created before
-- the reward result columns were added.
alter table public.typing_sprint_rounds
  add column if not exists applied_track_id uuid
    references public.reward_tracks(id),
  add column if not exists reward_points bigint;

create index if not exists typing_sprint_rounds_user_created_idx
  on public.typing_sprint_rounds (user_id, created_at desc);

-- ON CONFLICT (user_id, milestone_id) in the function requires this
-- uniqueness guarantee. The project currently has no such constraint.
create unique index if not exists user_reward_grants_user_milestone_uidx
  on public.user_reward_grants (user_id, milestone_id);

alter table public.typing_sprint_rounds enable row level security;

revoke all on table public.typing_sprint_rounds from anon, authenticated;
grant select on table public.typing_sprint_rounds to authenticated;

drop policy if exists typing_sprint_rounds_read_own
  on public.typing_sprint_rounds;

create policy typing_sprint_rounds_read_own
  on public.typing_sprint_rounds
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.complete_typing_round(
  p_request_id uuid,
  p_duration_seconds integer,
  p_prompt_pack text,
  p_prompt text,
  p_typed_text text,
  p_elapsed_ms integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.typing_sprint_rounds%rowtype;
  v_typed_characters integer;
  v_correct_characters integer := 0;
  v_wpm integer;
  v_accuracy numeric(5, 2);
  v_score integer;
  v_index integer;
  v_track_id uuid;
  v_score_step bigint;
  v_points_per_marker integer;
  v_previous_points bigint;
  v_score_remainder bigint;
  v_points_earned bigint := 0;
  v_new_points bigint;
  v_new_remainder bigint;
  v_final_points bigint := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;

  if p_request_id is null then
    raise exception 'p_request_id is required';
  end if;

  if p_prompt_pack is null
     or p_prompt_pack not in ('sentences', 'words') then
    raise exception 'Invalid prompt pack';
  end if;

  if p_prompt is null
     or char_length(p_prompt) not between 1 and 10000 then
    raise exception 'Invalid prompt';
  end if;

  if p_typed_text is null
     or char_length(p_typed_text) > 10000 then
    raise exception 'Invalid typed text';
  end if;

  if p_duration_seconds is null
     or p_duration_seconds not in (15, 30, 60) then
    raise exception 'Invalid duration';
  end if;

  if p_elapsed_ms is null
     or p_elapsed_ms not between 0 and 3600000 then
    raise exception 'Invalid elapsed time';
  end if;

  -- Serialize calls with the same user/request ID. This prevents concurrent
  -- retries from both awarding points before the unique round row is visible.
  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':' || p_request_id::text, 0)
  );

  select *
    into v_existing
    from public.typing_sprint_rounds
   where user_id = v_user_id
     and request_id = p_request_id;

  if found then
    return jsonb_build_object(
      'requestId', v_existing.request_id,
      'wpm', v_existing.wpm,
      'accuracy', v_existing.accuracy,
      'score', v_existing.score,
      'typedCharacters', v_existing.typed_characters,
      'correctCharacters', v_existing.correct_characters,
      'rewardTrackId', v_existing.applied_track_id,
      'rewardPoints', coalesce(v_existing.reward_points, 0)
    );
  end if;

  v_typed_characters := char_length(p_typed_text);

  if v_typed_characters > 0 then
    for v_index in 1..least(char_length(p_prompt), v_typed_characters) loop
      if substr(p_prompt, v_index, 1) = substr(p_typed_text, v_index, 1) then
        v_correct_characters := v_correct_characters + 1;
      end if;
    end loop;
  end if;

  v_accuracy :=
    case
      when v_typed_characters = 0 then 100
      else round(
        v_correct_characters::numeric / v_typed_characters * 100,
        2
      )
    end;

  v_wpm :=
    case
      when p_elapsed_ms = 0 then 0
      else round(
        (v_typed_characters::numeric / 5)
        / (p_elapsed_ms::numeric / 60000)
      )::integer
    end;

  -- Apply the cap before converting to integer, avoiding overflow.
  v_score := least(
    500::numeric,
    greatest(
      0::numeric,
      floor(v_wpm::numeric * v_accuracy / 100)
    )
  )::integer;

  -- Lock the selected track row while applying this round's score.
  select s.track_id, t.score_step, t.points_per_score_milestone
    into v_track_id, v_score_step, v_points_per_marker
    from public.user_reward_track_selections as s
    join public.reward_tracks as t
      on t.id = s.track_id
     and t.is_active
   where s.user_id = v_user_id
   for share of s, t;

  insert into public.typing_sprint_rounds (
    user_id,
    request_id,
    duration_seconds,
    prompt_pack,
    prompt,
    typed_text,
    elapsed_ms,
    typed_characters,
    correct_characters,
    wpm,
    accuracy,
    score,
    applied_track_id,
    reward_points
  )
  values (
    v_user_id,
    p_request_id,
    p_duration_seconds,
    p_prompt_pack,
    p_prompt,
    p_typed_text,
    p_elapsed_ms,
    v_typed_characters,
    v_correct_characters,
    v_wpm,
    v_accuracy,
    v_score,
    v_track_id,
    0
  );

  if v_track_id is not null and v_score > 0 then
    insert into public.user_reward_track_progress (
      user_id,
      track_id,
      points,
      last_score_marker
    )
    values (
      v_user_id,
      v_track_id,
      0,
      0
    )
    on conflict (user_id, track_id) do nothing;

    select points, score_remainder
      into v_previous_points, v_score_remainder
      from public.user_reward_track_progress
     where user_id = v_user_id
       and track_id = v_track_id
     for update;

    v_points_earned :=
      floor(
        (v_score_remainder + v_score)::numeric / v_score_step
      )::bigint * v_points_per_marker;

    v_new_remainder := mod(v_score_remainder + v_score, v_score_step);
    v_new_points := v_previous_points + v_points_earned;

    update public.user_reward_track_progress
       set points = v_new_points,
           score_remainder = v_new_remainder,
           last_score_marker = last_score_marker + v_score,
           updated_at = now()
     where user_id = v_user_id
       and track_id = v_track_id;

    insert into public.user_reward_grants (
      user_id,
      milestone_id,
      track_id,
      reward_name,
      reward_payload
    )
    select
      v_user_id,
      m.id,
      m.track_id,
      m.name,
      m.reward_payload
      from public.reward_track_milestones as m
     where m.track_id = v_track_id
       and m.points_required <= v_new_points
    on conflict (user_id, milestone_id) do nothing;
  end if;

  if v_track_id is not null then
    select coalesce(
      (
        select p.points
          from public.user_reward_track_progress as p
         where p.user_id = v_user_id
           and p.track_id = v_track_id
      ),
      0
    )
    into v_final_points;
  end if;

  -- Save the resulting point balance with the round so a retry returns the
  -- same response even if the user later changes tracks or earns more points.
  update public.typing_sprint_rounds
     set reward_points = v_final_points
   where user_id = v_user_id
     and request_id = p_request_id;

  return jsonb_build_object(
    'requestId', p_request_id,
    'wpm', v_wpm,
    'accuracy', v_accuracy,
    'score', v_score,
    'typedCharacters', v_typed_characters,
    'correctCharacters', v_correct_characters,
    'rewardTrackId', v_track_id,
    'rewardPoints', v_final_points
  );
end;
$$;

revoke all on function public.complete_typing_round(
  uuid,
  integer,
  text,
  text,
  text,
  integer
) from public, anon;

grant execute on function public.complete_typing_round(
  uuid,
  integer,
  text,
  text,
  text,
  integer
) to authenticated;