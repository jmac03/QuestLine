BEGIN;

-- Ensure the column is present and consistently non-null, even if it already
-- existed in a nullable form from an earlier partial deployment.
ALTER TABLE public.typing_sprint_rounds
  ADD COLUMN IF NOT EXISTS mistakes integer NOT NULL DEFAULT 0;

UPDATE public.typing_sprint_rounds
   SET mistakes = 0
 WHERE mistakes IS NULL;

ALTER TABLE public.typing_sprint_rounds
  ALTER COLUMN mistakes SET DEFAULT 0,
  ALTER COLUMN mistakes SET NOT NULL;

ALTER TABLE public.typing_sprint_rounds
  DROP CONSTRAINT IF EXISTS typing_sprint_rounds_mistakes_check;

ALTER TABLE public.typing_sprint_rounds
  ADD CONSTRAINT typing_sprint_rounds_mistakes_check
  CHECK (mistakes >= 0 AND mistakes <= 10000);

-- The old RPC uses p_client_score as its last argument. Callers must change
-- the named RPC argument to p_mistakes when deploying this migration.
DROP FUNCTION IF EXISTS public.complete_typing_round(
  uuid, integer, text, text, text, integer, integer
);

CREATE FUNCTION public.complete_typing_round(
  p_request_id uuid,
  p_duration_seconds integer,
  p_prompt_pack text,
  p_prompt text,
  p_typed_text text,
  p_elapsed_ms integer,
  p_mistakes integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'p_request_id is required';
  END IF;

  IF p_prompt_pack IS NULL
     OR p_prompt_pack NOT IN ('sentences', 'words') THEN
    RAISE EXCEPTION 'Invalid prompt pack';
  END IF;

  IF p_prompt IS NULL
     OR char_length(p_prompt) NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'Invalid prompt';
  END IF;

  IF p_typed_text IS NULL
     OR char_length(p_typed_text) > 10000 THEN
    RAISE EXCEPTION 'Invalid typed text';
  END IF;

  IF p_duration_seconds IS NULL
     OR p_duration_seconds NOT IN (15, 30, 60) THEN
    RAISE EXCEPTION 'Invalid duration';
  END IF;

  IF p_elapsed_ms IS NULL
     OR p_elapsed_ms NOT BETWEEN 0 AND 3600000 THEN
    RAISE EXCEPTION 'Invalid elapsed time';
  END IF;

  IF p_mistakes IS NULL
     OR p_mistakes NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION 'Invalid mistakes count';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_user_id::text || ':' || p_request_id::text,
      0
    )
  );

  SELECT *
    INTO v_existing
    FROM public.typing_sprint_rounds
   WHERE user_id = v_user_id
     AND request_id = p_request_id;

  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'requestId', v_existing.request_id,
      'wpm', v_existing.wpm,
      'accuracy', v_existing.accuracy,
      'score', v_existing.score,
      'mistakes', v_existing.mistakes,
      'typedCharacters', v_existing.typed_characters,
      'correctCharacters', v_existing.correct_characters,
      'rewardTrackId', v_existing.applied_track_id,
      'rewardPoints', v_existing.reward_points
    );
  END IF;

  v_typed_characters := char_length(p_typed_text);

  IF v_typed_characters > 0 THEN
    FOR v_index IN 1..least(char_length(p_prompt), v_typed_characters) LOOP
      IF substr(p_prompt, v_index, 1) = substr(p_typed_text, v_index, 1) THEN
        v_correct_characters := v_correct_characters + 1;
      END IF;
    END LOOP;
  END IF;

  v_accuracy :=
    CASE
      WHEN v_typed_characters = 0 THEN 100
      ELSE round(
        v_correct_characters::numeric / v_typed_characters * 100,
        2
      )
    END;

  v_wpm :=
    CASE
      WHEN p_elapsed_ms = 0 THEN 0
      ELSE round(
        (v_typed_characters::numeric / 5)
        / (p_elapsed_ms::numeric / 60000)
      )::integer
    END;

  -- Score is computed from the submitted text and client-reported mistakes.
  v_score := greatest(
    0,
    round(v_wpm * v_accuracy / 100)::integer - p_mistakes * 2
  );

  SELECT s.track_id, t.score_step, t.points_per_score_milestone
    INTO v_track_id, v_score_step, v_points_per_marker
    FROM public.user_reward_track_selections AS s
    JOIN public.reward_tracks AS t
      ON t.id = s.track_id
     AND t.is_active
   WHERE s.user_id = v_user_id
   FOR SHARE OF s, t;

  INSERT INTO public.typing_sprint_rounds (
    user_id,
    request_id,
    duration_seconds,
    prompt_pack,
    prompt,
    typed_text,
    elapsed_ms,
    typed_characters,
    correct_characters,
    mistakes,
    wpm,
    accuracy,
    score,
    applied_track_id,
    reward_points
  )
  VALUES (
    v_user_id,
    p_request_id,
    p_duration_seconds,
    p_prompt_pack,
    p_prompt,
    p_typed_text,
    p_elapsed_ms,
    v_typed_characters,
    v_correct_characters,
    p_mistakes,
    v_wpm,
    v_accuracy,
    v_score,
    v_track_id,
    v_score
  );

  IF v_track_id IS NOT NULL AND v_score > 0 THEN
    INSERT INTO public.user_reward_track_progress (
      user_id,
      track_id,
      points,
      last_score_marker
    )
    VALUES (
      v_user_id,
      v_track_id,
      0,
      0
    )
    ON CONFLICT (user_id, track_id) DO NOTHING;

    SELECT points, score_remainder
      INTO v_previous_points, v_score_remainder
      FROM public.user_reward_track_progress
     WHERE user_id = v_user_id
       AND track_id = v_track_id
     FOR UPDATE;

    v_points_earned := floor(
      (v_score_remainder + v_score)::numeric / v_score_step
    )::bigint * v_points_per_marker;

    v_new_remainder := mod(v_score_remainder + v_score, v_score_step);
    v_new_points := v_previous_points + v_points_earned;

    UPDATE public.user_reward_track_progress
       SET points = v_new_points,
           score_remainder = v_new_remainder,
           last_score_marker = last_score_marker + v_score,
           updated_at = now()
     WHERE user_id = v_user_id
       AND track_id = v_track_id;

    INSERT INTO public.user_reward_grants (
      user_id,
      milestone_id,
      track_id,
      reward_name,
      reward_payload
    )
    SELECT
      v_user_id,
      m.id,
      m.track_id,
      m.name,
      m.reward_payload
      FROM public.reward_track_milestones AS m
     WHERE m.track_id = v_track_id
       AND m.points_required <= v_new_points
    ON CONFLICT (user_id, milestone_id) DO NOTHING;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'requestId', p_request_id,
    'wpm', v_wpm,
    'accuracy', v_accuracy,
    'score', v_score,
    'mistakes', p_mistakes,
    'typedCharacters', v_typed_characters,
    'correctCharacters', v_correct_characters,
    'rewardTrackId', v_track_id,
    'rewardPoints', v_score
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_typing_round(
  uuid, integer, text, text, text, integer, integer
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.complete_typing_round(
  uuid, integer, text, text, text, integer, integer
) TO authenticated, service_role;

COMMENT ON COLUMN public.typing_sprint_rounds.mistakes IS
  'Client-reported incorrect character entries, used as a score penalty.';

COMMIT;