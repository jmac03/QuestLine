BEGIN;

ALTER TABLE public.typing_sprint_rounds
  DROP CONSTRAINT IF EXISTS typing_sprint_rounds_score_check;

ALTER TABLE public.typing_sprint_rounds
  ADD CONSTRAINT typing_sprint_rounds_score_within_wpm_check
  CHECK (score >= 0 AND score <= wpm);

DROP FUNCTION public.complete_typing_round(uuid, integer, text, text, text, integer);

CREATE FUNCTION public.complete_typing_round(
  p_request_id uuid,
  p_duration_seconds integer,
  p_prompt_pack text,
  p_prompt text,
  p_typed_text text,
  p_elapsed_ms integer,
  p_client_score integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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

  if p_client_score is null then
    raise exception 'p_client_score is required';
  end if;

  -- Serialize calls with the same user/request ID so retries cannot award
  -- reward points more than once.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_user_id::text || ':' || p_request_id::text,
      0
    )
  );

  select *
    into v_existing
    from public.typing_sprint_rounds
   where user_id = v_user_id
     and request_id = p_request_id;

  if found then
    return pg_catalog.jsonb_build_object(
      'requestId', v_existing.request_id,
      'wpm', v_existing.wpm,
      'accuracy', v_existing.accuracy,
      'score', v_existing.score,
      'typedCharacters', v_existing.typed_characters,
      'correctCharacters', v_existing.correct_characters,
      'rewardTrackId', v_existing.applied_track_id,
      'rewardPoints', v_existing.reward_points
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

  -- Trust the client's score only within the server-calculated WPM ceiling.
  v_score := least(v_wpm, greatest(0, p_client_score));

  -- Lock the selected active track while applying this round's score.
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
    v_score
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

  return pg_catalog.jsonb_build_object(
    'requestId', p_request_id,
    'wpm', v_wpm,
    'accuracy', v_accuracy,
    'score', v_score,
    'typedCharacters', v_typed_characters,
    'correctCharacters', v_correct_characters,
    'rewardTrackId', v_track_id,
    'rewardPoints', v_score
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.complete_typing_round(uuid, integer, text, text, text, integer, integer)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.complete_typing_round(uuid, integer, text, text, text, integer, integer)
  TO authenticated, service_role;

COMMIT;