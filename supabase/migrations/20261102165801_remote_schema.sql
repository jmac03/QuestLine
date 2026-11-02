SET local check_function_bodies = off;

ALTER TABLE "public"."number_roll_players"
  DROP CONSTRAINT "number_roll_players_current_energy_check";

ALTER TABLE "public"."number_rolls"
  DROP CONSTRAINT "number_rolls_user_id_fkey";

DROP FUNCTION "public"."grant_song_reward"(uuid, uuid, text, text, uuid);

CREATE SCHEMA "private";

CREATE TABLE "private"."questline_energy_grants" (
  "user_id"        uuid                     NOT NULL,
  "grant_id"       uuid                     NOT NULL,
  "amount"         integer                  NOT NULL,
  "applied_amount" integer                  NOT NULL,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "questline_energy_grants_amount_check" CHECK ((amount > 0)),
  CONSTRAINT "questline_energy_grants_check" CHECK (((applied_amount >= 0) AND (applied_amount <= amount))),
  CONSTRAINT "questline_energy_grants_pkey" PRIMARY KEY (user_id, grant_id)
);

ALTER TABLE "private"."questline_energy_grants"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."reward_track_milestones" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "track_id"        uuid                     NOT NULL,
  "points_required" bigint                   NOT NULL,
  "name"            text                     NOT NULL,
  "reward_payload"  jsonb                    NOT NULL,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "reward_track_milestones_pkey" PRIMARY KEY (id),
  CONSTRAINT "reward_track_milestones_points_required_check" CHECK ((points_required > 0)),
  CONSTRAINT "reward_track_milestones_reward_payload_check" CHECK ((jsonb_typeof(reward_payload) = 'object'::text)),
  CONSTRAINT "reward_track_milestones_track_id_points_required_key" UNIQUE (track_id, points_required)
);

ALTER TABLE "public"."reward_track_milestones"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."reward_tracks" (
  "id"                         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "slug"                       text                     NOT NULL,
  "name"                       text                     NOT NULL,
  "description"                text,
  "score_step"                 bigint                   NOT NULL DEFAULT 1000,
  "points_per_score_milestone" integer                  NOT NULL DEFAULT 1,
  "is_active"                  boolean                  NOT NULL DEFAULT true,
  "created_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "reward_tracks_pkey" PRIMARY KEY (id),
  CONSTRAINT "reward_tracks_points_per_score_milestone_check" CHECK ((points_per_score_milestone > 0)),
  CONSTRAINT "reward_tracks_score_step_check" CHECK ((score_step > 0)),
  CONSTRAINT "reward_tracks_slug_key" UNIQUE (slug)
);

ALTER TABLE "public"."reward_tracks"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."user_reward_grants" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"        uuid                     NOT NULL,
  "milestone_id"   uuid                     NOT NULL,
  "track_id"       uuid                     NOT NULL,
  "reward_name"    text                     NOT NULL,
  "reward_payload" jsonb                    NOT NULL,
  "granted_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "user_reward_grants_pkey" PRIMARY KEY (id),
  CONSTRAINT "user_reward_grants_reward_payload_check" CHECK ((jsonb_typeof(reward_payload) = 'object'::text)),
  CONSTRAINT "user_reward_grants_user_id_milestone_id_key" UNIQUE (user_id, milestone_id)
);

ALTER TABLE "public"."user_reward_grants"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."user_reward_track_progress" (
  "user_id"           uuid                     NOT NULL,
  "track_id"          uuid                     NOT NULL,
  "points"            bigint                   NOT NULL DEFAULT 0,
  "last_score_marker" bigint                   NOT NULL DEFAULT 0,
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "score_remainder"   bigint                   NOT NULL DEFAULT 0,
  CONSTRAINT "user_reward_track_progress_last_score_marker_check" CHECK ((last_score_marker >= 0)),
  CONSTRAINT "user_reward_track_progress_pkey" PRIMARY KEY (user_id, track_id),
  CONSTRAINT "user_reward_track_progress_points_check" CHECK ((points >= 0)),
  CONSTRAINT "user_reward_track_progress_score_remainder_check" CHECK ((score_remainder >= 0))
);

ALTER TABLE "public"."user_reward_track_progress"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."user_reward_track_selection_history" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"             uuid                     NOT NULL,
  "track_id"            uuid                     NOT NULL,
  "selected_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "tracking_started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deselected_at"       timestamp with time zone,
  "score_at_start"      bigint                   NOT NULL,
  "score_at_end"        bigint,
  "score_earned"        bigint                   NOT NULL DEFAULT 0,
  "points_earned"       bigint                   NOT NULL DEFAULT 0,
  CONSTRAINT "user_reward_track_selection_history_check1" CHECK (((deselected_at IS NULL) OR (deselected_at >= selected_at))),
  CONSTRAINT "user_reward_track_selection_history_check" CHECK (((deselected_at IS NULL) = (score_at_end IS NULL))),
  CONSTRAINT "user_reward_track_selection_history_pkey" PRIMARY KEY (id),
  CONSTRAINT "user_reward_track_selection_history_points_earned_check" CHECK ((points_earned >= 0)),
  CONSTRAINT "user_reward_track_selection_history_score_at_end_check" CHECK (((score_at_end IS NULL) OR (score_at_end >= 0))),
  CONSTRAINT "user_reward_track_selection_history_score_at_start_check" CHECK ((score_at_start >= 0)),
  CONSTRAINT "user_reward_track_selection_history_score_earned_check" CHECK ((score_earned >= 0))
);

ALTER TABLE "public"."user_reward_track_selection_history"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."user_reward_track_selections" (
  "user_id"     uuid                     NOT NULL,
  "track_id"    uuid                     NOT NULL,
  "selected_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "user_reward_track_selections_pkey" PRIMARY KEY (user_id)
);

ALTER TABLE "public"."user_reward_track_selections"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."users" (
  "id"                bigint                   GENERATED BY DEFAULT AS IDENTITY (SEQUENCE NAME "public"."User_id_seq") NOT NULL,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "username"          text,
  "email"             text,
  "quest_line_energy" smallint                 NOT NULL DEFAULT '10'::smallint,
  "auth_user_id"      uuid,
  CONSTRAINT "User_email_key" UNIQUE (email),
  CONSTRAINT "User_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."users"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."number_roll_players"
  ADD COLUMN "energy_regen_at" timestamp WITH time zone NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION private.regenerate_number_roll_energy (
  p_user_id uuid
)
  RETURNS public.number_roll_players
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_player public.number_roll_players%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_ticks integer;
  v_awarded integer;
  v_new_energy integer;
  v_new_regen_at timestamptz;
begin
  select *
    into strict v_player
    from public.number_roll_players
   where user_id = p_user_id
   for update;

  if v_player.current_energy >= v_player.max_energy then
    v_new_energy := v_player.max_energy;
    v_new_regen_at := v_now;
  else
    v_ticks := pg_catalog.floor(
      greatest(
        extract(epoch from (v_now - v_player.energy_regen_at)),
        0
      ) / 8640
    )::integer;

    v_awarded := least(
      v_ticks,
      v_player.max_energy - v_player.current_energy
    );

    v_new_energy := v_player.current_energy + v_awarded;

    if v_new_energy >= v_player.max_energy then
      v_new_regen_at := v_now;
    elsif v_awarded > 0 then
      v_new_regen_at :=
        v_player.energy_regen_at + (v_awarded * interval '8640 seconds');
    else
      v_new_regen_at := v_player.energy_regen_at;
    end if;
  end if;

  update public.number_roll_players
     set current_energy = v_new_energy,
         energy_regen_at = v_new_regen_at,
         updated_at = case
           when current_energy is distinct from v_new_energy
             or energy_regen_at is distinct from v_new_regen_at
           then v_now
           else updated_at
         end
   where user_id = p_user_id
   returning * into strict v_player;

  return v_player;
end;
$function$;

CREATE OR REPLACE FUNCTION public.award_selected_reward_track_points()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_track_id uuid;
  v_selection_history_id uuid;
  v_score_step bigint;
  v_points_per_marker integer;
  v_score_remainder bigint;
  v_previous_points bigint;
  v_score_delta bigint;
  v_accumulated_score numeric;
  v_points_earned bigint;
  v_new_remainder bigint;
  v_new_points bigint;
begin
  if new.total_score <= old.total_score then
    return new;
  end if;

  select s.track_id, h.id
    into v_track_id, v_selection_history_id
  from public.user_reward_track_selections s
  join public.user_reward_track_selection_history h
    on h.user_id = s.user_id
   and h.track_id = s.track_id
   and h.deselected_at is null
  where s.user_id = new.user_id
  for update of h;

  if v_track_id is null then
    return new;
  end if;

  select t.score_step, t.points_per_score_milestone
    into v_score_step, v_points_per_marker
  from public.reward_tracks t
  where t.id = v_track_id and t.is_active;

  if not found then
    return new;
  end if;

  v_score_delta := new.total_score - old.total_score;

  insert into public.user_reward_track_progress (user_id, track_id, points, last_score_marker)
  values (new.user_id, v_track_id, 0, old.total_score)
  on conflict (user_id, track_id) do nothing;

  select p.score_remainder, p.points
    into v_score_remainder, v_previous_points
  from public.user_reward_track_progress p
  where p.user_id = new.user_id and p.track_id = v_track_id
  for update;

  v_accumulated_score := v_score_remainder::numeric + v_score_delta::numeric;
  v_points_earned := floor(v_accumulated_score / v_score_step)::bigint * v_points_per_marker;
  v_new_remainder := mod(v_accumulated_score, v_score_step)::bigint;
  v_new_points := v_previous_points + v_points_earned;

  update public.user_reward_track_progress
  set points = v_new_points,
      score_remainder = v_new_remainder,
      last_score_marker = greatest(last_score_marker, new.total_score),
      updated_at = now()
  where user_id = new.user_id and track_id = v_track_id;

  update public.user_reward_track_selection_history
  set score_earned = score_earned + v_score_delta,
      points_earned = points_earned + v_points_earned
  where id = v_selection_history_id;

  insert into public.user_reward_grants (
    user_id, milestone_id, track_id, reward_name, reward_payload
  )
  select new.user_id, m.id, m.track_id, m.name, m.reward_payload
  from public.reward_track_milestones m
  where m.track_id = v_track_id
    and m.points_required <= v_new_points
  on conflict (user_id, milestone_id) do nothing;

  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."award_selected_reward_track_points"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.get_roll_state()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user_id uuid := auth.uid();
  v_player public.number_roll_players%rowtype;
  v_recent_rolls jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required'
      using errcode = '28000';
  end if;

  insert into public.number_roll_players (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  v_player := private.regenerate_number_roll_energy(v_user_id);

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'roll_value', recent.roll_value,
        'score_gain', recent.score_gain,
        'rarity', recent.rarity,
        'badges', recent.badges
      )
      order by recent.created_at desc
    ),
    '[]'::jsonb
  )
    into v_recent_rolls
    from (
      select r.roll_value, r.score_gain, r.rarity, r.badges, r.created_at
        from public.number_rolls r
       where r.user_id = v_user_id
       order by r.created_at desc
       limit 5
    ) recent;

  return pg_catalog.jsonb_build_object(
    'currentEnergy', v_player.current_energy,
    'maxEnergy', v_player.max_energy,
    'totalScore', v_player.total_score,
    'bestScore', v_player.best_score,
    'canRoll', v_player.current_energy > 0,
    'recentRolls', v_recent_rolls
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.grant_questline_energy (
  p_user_id  uuid,
  p_grant_id uuid,
  p_amount   integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_player public.number_roll_players%rowtype;
  v_existing_amount integer;
  v_applied integer;
begin
  if p_user_id is null or p_grant_id is null then
    raise exception 'user_id and grant_id are required'
      using errcode = '22023';
  end if;

  if p_amount is null or p_amount < 1 or p_amount > 10 then
    raise exception 'amount must be between 1 and 10'
      using errcode = '22023';
  end if;

  insert into public.number_roll_players (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  v_player := private.regenerate_number_roll_energy(p_user_id);

  insert into private.questline_energy_grants (
    user_id,
    grant_id,
    amount,
    applied_amount
  )
  values (
    p_user_id,
    p_grant_id,
    p_amount,
    least(p_amount, v_player.max_energy - v_player.current_energy)
  )
  on conflict (user_id, grant_id) do nothing;

  if not found then
    select amount
      into strict v_existing_amount
      from private.questline_energy_grants
     where user_id = p_user_id
       and grant_id = p_grant_id;

    if v_existing_amount <> p_amount then
      raise exception 'grant_id was already used with a different amount'
        using errcode = '22023';
    end if;

    return pg_catalog.jsonb_build_object(
      'currentEnergy', v_player.current_energy,
      'maxEnergy', v_player.max_energy,
      'energyRegenAt', v_player.energy_regen_at,
      'appliedAmount', 0,
      'alreadyApplied', true
    );
  end if;

  select applied_amount
    into strict v_applied
    from private.questline_energy_grants
   where user_id = p_user_id
     and grant_id = p_grant_id;

  update public.number_roll_players
     set current_energy = least(max_energy, current_energy + v_applied),
         updated_at = case
           when v_applied > 0 then pg_catalog.clock_timestamp()
           else updated_at
         end
   where user_id = p_user_id
   returning * into strict v_player;

  return pg_catalog.jsonb_build_object(
    'currentEnergy', v_player.current_energy,
    'maxEnergy', v_player.max_energy,
    'energyRegenAt', v_player.energy_regen_at,
    'appliedAmount', v_applied,
    'alreadyApplied', false
  );
end;
$function$;

REVOKE ALL ON FUNCTION "public"."grant_questline_energy"(uuid, uuid, integer) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.grant_song_reward (
  p_user_id     uuid,
  p_track_id    uuid,
  p_reward_name text,
  p_song_id     text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
DECLARE
  new_grant_id uuid;
  matched_milestone_id uuid;
  normalized_reward_name text := pg_catalog.btrim(p_reward_name);
  normalized_song_id text := pg_catalog.btrim(p_song_id);
BEGIN
  IF p_user_id IS NULL OR p_track_id IS NULL THEN
    RAISE EXCEPTION 'A user ID and track ID are required';
  END IF;

  IF normalized_reward_name IS NULL OR normalized_reward_name = '' THEN
    RAISE EXCEPTION 'A reward name is required';
  END IF;

  IF normalized_song_id IS NULL OR normalized_song_id = '' THEN
    RAISE EXCEPTION 'A song ID is required';
  END IF;

  BEGIN
    SELECT m.id
    INTO STRICT matched_milestone_id
    FROM public.reward_track_milestones AS m
    WHERE m.track_id = p_track_id
      AND m.name = normalized_reward_name
      AND m.reward_payload = pg_catalog.jsonb_build_object(
        'type', 'song',
        'song_id', normalized_song_id
      );
  EXCEPTION
    WHEN no_data_found THEN
      RAISE EXCEPTION 'No matching song milestone exists for this reward';
    WHEN too_many_rows THEN
      RAISE EXCEPTION 'More than one matching song milestone exists';
  END;

  INSERT INTO public.user_reward_grants (
    milestone_id,
    user_id,
    track_id,
    reward_name,
    reward_payload
  )
  VALUES (
    matched_milestone_id,
    p_user_id,
    p_track_id,
    normalized_reward_name,
    pg_catalog.jsonb_build_object(
      'type', 'song',
      'song_id', normalized_song_id
    )
  )
  RETURNING id INTO new_grant_id;

  RETURN new_grant_id;
END;
$function$;

REVOKE ALL ON FUNCTION "public"."grant_song_reward"(uuid, uuid, text, text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.handle_auth_user_created_set_username()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  insert into public.users (auth_user_id, email, username)
  values (new.id, new.email, new.email)
  on conflict (email) do update
    set auth_user_id = excluded.auth_user_id,
        username = coalesce(public.users.username, excluded.username)
    where public.users.auth_user_id is null
       or public.users.auth_user_id = excluded.auth_user_id;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  insert into public.users (auth_user_id, email, username)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'username', new.raw_user_meta_data ->> 'name')
  )
  on conflict do nothing;

  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."handle_new_auth_user"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.number_roll_result (
  p_roll integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  IMMUTABLE
  PARALLEL SAFE
  SET search_path TO ''
  AS $function$
declare
  v_digits text;
  v_score_gain integer := 0;
  v_badges jsonb := '[]'::jsonb;
  v_rarity text;
  v_is_prime boolean := true;
  v_divisor integer;
begin
  if p_roll is null or p_roll < 1 or p_roll > 1000 then
    raise exception 'roll must be between 1 and 1000'
      using errcode = '22023';
  end if;

  v_digits := p_roll::text;

  if p_roll > 1 then
    v_divisor := 2;

    while v_divisor * v_divisor <= p_roll loop
      if p_roll % v_divisor = 0 then
        v_is_prime := false;
        exit;
      end if;

      v_divisor := v_divisor + 1;
    end loop;
  else
    v_is_prime := false;
  end if;

  if v_is_prime then
    v_score_gain := v_score_gain + 100;
    v_badges := v_badges || '["prime"]'::jsonb;
  end if;

  if v_digits = pg_catalog.reverse(v_digits) then
    v_score_gain := v_score_gain + 80;
    v_badges := v_badges || '["palindrome"]'::jsonb;
  end if;

  if p_roll % 2 = 0 then
    v_score_gain := v_score_gain + 20;
    v_badges := v_badges || '["even"]'::jsonb;
  else
    v_score_gain := v_score_gain + 20;
    v_badges := v_badges || '["odd"]'::jsonb;
  end if;

  -- Award the repeating-digits badge only when every digit is the same.
  if pg_catalog.length(v_digits) > 1
     and pg_catalog.length(
       pg_catalog.replace(v_digits, pg_catalog.substr(v_digits, 1, 1), '')
     ) = 0 then
    v_score_gain := v_score_gain + 60;
    v_badges := v_badges || '["repeating_digits"]'::jsonb;
  end if;

  if p_roll in (7, 42, 777) then
    v_score_gain := v_score_gain + 50;
    v_badges := v_badges || '["lucky_number"]'::jsonb;
  end if;

  if p_roll >= 900 then
    v_score_gain := v_score_gain + 150;
    v_badges := v_badges || '["high_roller"]'::jsonb;
  elsif p_roll <= 100 then
    v_score_gain := v_score_gain + 40;
    v_badges := v_badges || '["low_ball"]'::jsonb;
  end if;

  v_rarity := case
    when v_score_gain >= 250 then 'Epic'
    when v_score_gain >= 150 then 'Rare'
    when v_score_gain >= 80 then 'Uncommon'
    else 'Common'
  end;

  return pg_catalog.jsonb_build_object(
    'roll', p_roll,
    'scoreGain', v_score_gain,
    'rarity', v_rarity,
    'badges', v_badges
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
  AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.roll_number (
  p_request_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user_id uuid := auth.uid();
  v_player public.number_roll_players%rowtype;
  v_prior_roll public.number_rolls%rowtype;
  v_roll_value integer;
  v_evaluated jsonb;
  v_score_gain integer;
  v_rarity text;
  v_badges jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required'
      using errcode = '28000';
  end if;

  if p_request_id is null then
    raise exception 'p_request_id is required'
      using errcode = '22023';
  end if;

  insert into public.number_roll_players (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  -- This locks the player's row, serializing concurrent rolls and retries.
  v_player := private.regenerate_number_roll_energy(v_user_id);

  select *
    into v_prior_roll
    from public.number_rolls
   where user_id = v_user_id
     and request_id = p_request_id;

  if found then
    return pg_catalog.jsonb_build_object(
      'roll', v_prior_roll.roll_value,
      'scoreGain', v_prior_roll.score_gain,
      'rarity', v_prior_roll.rarity,
      'badges', v_prior_roll.badges,
      'canRoll', v_player.current_energy > 0,
      'currentEnergy', v_player.current_energy,
      'maxEnergy', v_player.max_energy,
      'totalScore', v_player.total_score,
      'bestScore', v_player.best_score
    );
  end if;

  if v_player.current_energy < 1 then
    raise exception 'No energy available';
  end if;

  v_roll_value :=
    pg_catalog.floor(pg_catalog.random() * 1000 + 1)::integer;

  v_evaluated := public.number_roll_result(v_roll_value);
  v_score_gain := (v_evaluated ->> 'scoreGain')::integer;
  v_rarity := v_evaluated ->> 'rarity';
  v_badges := v_evaluated -> 'badges';

  insert into public.number_rolls (
    user_id,
    request_id,
    roll_value,
    score_gain,
    rarity,
    badges
  )
  values (
    v_user_id,
    p_request_id,
    v_roll_value,
    v_score_gain,
    v_rarity,
    v_badges
  );

  update public.number_roll_players
     set current_energy = current_energy - 1,
         total_score = total_score + v_score_gain,
         best_score = greatest(best_score, v_score_gain),
         updated_at = pg_catalog.now()
   where user_id = v_user_id
   returning * into v_player;

  return v_evaluated || pg_catalog.jsonb_build_object(
    'canRoll', v_player.current_energy > 0,
    'currentEnergy', v_player.current_energy,
    'maxEnergy', v_player.max_energy,
    'totalScore', v_player.total_score,
    'bestScore', v_player.best_score
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.select_reward_track (
  p_track_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user_id uuid := auth.uid();
  v_score bigint := 0;
  v_score_step bigint;
  v_current_track_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select t.score_step
    into v_score_step
    from public.reward_tracks t
   where t.id = p_track_id
     and t.is_active;

  if not found then
    raise exception 'Reward track is not available';
  end if;

  select p.total_score
    into v_score
    from public.number_roll_players p
   where p.user_id = v_user_id
   for update;

  v_score := coalesce(v_score, 0);

  select s.track_id
    into v_current_track_id
    from public.user_reward_track_selections s
   where s.user_id = v_user_id
   for update;

  if v_current_track_id = p_track_id then
    if not exists (
      select 1
        from public.user_reward_track_selection_history h
       where h.user_id = v_user_id
         and h.deselected_at is null
    ) then
      insert into public.user_reward_track_selection_history (
        user_id,
        track_id,
        selected_at,
        tracking_started_at,
        score_at_start
      )
      values (
        v_user_id,
        p_track_id,
        v_now,
        v_now,
        v_score
      );
    end if;

    return;
  end if;

  update public.user_reward_track_selection_history h
     set deselected_at = v_now,
         score_at_end = v_score
   where h.user_id = v_user_id
     and h.deselected_at is null;

  insert into public.user_reward_track_progress (
    user_id,
    track_id,
    points,
    last_score_marker
  )
  values (
    v_user_id,
    p_track_id,
    0,
    v_score
  )
  on conflict (user_id, track_id) do update
    set last_score_marker = greatest(
          public.user_reward_track_progress.last_score_marker,
          excluded.last_score_marker
        ),
        updated_at = v_now;

  insert into public.user_reward_track_selections (
    user_id,
    track_id,
    selected_at
  )
  values (
    v_user_id,
    p_track_id,
    v_now
  )
  on conflict (user_id) do update
    set track_id = excluded.track_id,
        selected_at = excluded.selected_at;

  insert into public.user_reward_track_selection_history (
    user_id,
    track_id,
    selected_at,
    tracking_started_at,
    score_at_start
  )
  values (
    v_user_id,
    p_track_id,
    v_now,
    v_now,
    v_score
  );
end;
$function$;

REVOKE ALL ON FUNCTION "public"."select_reward_track"(uuid) FROM PUBLIC, "anon";

ALTER TABLE "private"."questline_energy_grants"
  ADD CONSTRAINT "questline_energy_grants_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."number_roll_players"
  ADD CONSTRAINT "number_roll_players_check" CHECK (((current_energy >= 0) AND (current_energy <= max_energy)));

ALTER TABLE "public"."number_rolls"
  ADD CONSTRAINT "number_rolls_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.number_roll_players(user_id) ON DELETE CASCADE;

ALTER TABLE "public"."reward_track_milestones"
  ADD CONSTRAINT "reward_track_milestones_track_id_fkey" FOREIGN KEY (track_id) REFERENCES public.reward_tracks(id) ON DELETE CASCADE;

ALTER TABLE "public"."user_reward_grants"
  ADD CONSTRAINT "user_reward_grants_milestone_id_fkey" FOREIGN KEY (milestone_id) REFERENCES public.reward_track_milestones(id) ON DELETE RESTRICT;

ALTER TABLE "public"."user_reward_grants"
  ADD CONSTRAINT "user_reward_grants_track_id_fkey" FOREIGN KEY (track_id) REFERENCES public.reward_tracks(id) ON DELETE RESTRICT;

ALTER TABLE "public"."user_reward_grants"
  ADD CONSTRAINT "user_reward_grants_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."user_reward_track_progress"
  ADD CONSTRAINT "user_reward_track_progress_track_id_fkey" FOREIGN KEY (track_id) REFERENCES public.reward_tracks(id) ON DELETE CASCADE;

ALTER TABLE "public"."user_reward_track_progress"
  ADD CONSTRAINT "user_reward_track_progress_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."user_reward_track_selection_history"
  ADD CONSTRAINT "user_reward_track_selection_history_track_id_fkey" FOREIGN KEY (track_id) REFERENCES public.reward_tracks(id);

ALTER TABLE "public"."user_reward_track_selection_history"
  ADD CONSTRAINT "user_reward_track_selection_history_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."user_reward_track_selections"
  ADD CONSTRAINT "user_reward_track_selections_track_id_fkey" FOREIGN KEY (track_id) REFERENCES public.reward_tracks(id) ON DELETE RESTRICT;

ALTER TABLE "public"."user_reward_track_selections"
  ADD CONSTRAINT "user_reward_track_selections_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."users"
  ADD CONSTRAINT "users_auth_user_id_fkey" FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX user_reward_grants_user_granted_idx ON public.user_reward_grants USING btree (user_id, granted_at DESC);

CREATE UNIQUE INDEX user_reward_track_selection_history_one_active_per_user ON public.user_reward_track_selection_history USING btree (user_id)
  WHERE (deselected_at IS NULL);

CREATE INDEX user_reward_track_selection_history_user_selected_at_idx ON public.user_reward_track_selection_history USING btree (user_id, selected_at DESC);

CREATE UNIQUE INDEX users_auth_user_id_uidx ON public.users USING btree (auth_user_id);

CREATE TRIGGER create_public_user_after_auth_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

CREATE TRIGGER users_auth_signup_set_username
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_user_created_set_username();

CREATE TRIGGER number_roll_award_selected_reward_track
  AFTER UPDATE OF total_score ON public.number_roll_players
  FOR EACH ROW
  WHEN ((new.total_score > old.total_score))
  EXECUTE FUNCTION public.award_selected_reward_track_points();

CREATE POLICY "reward_milestones_read_active_tracks" ON "public"."reward_track_milestones"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.reward_tracks t
  WHERE ((t.id = reward_track_milestones.track_id) AND t.is_active))));

CREATE POLICY "reward_tracks_read_active" ON "public"."reward_tracks"
  FOR SELECT
  TO "authenticated"
  USING (is_active);

CREATE POLICY "reward_grants_read_own" ON "public"."user_reward_grants"
  FOR SELECT
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "reward_progress_read_own" ON "public"."user_reward_track_progress"
  FOR SELECT
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "user_reward_track_selection_history_read_own" ON "public"."user_reward_track_selection_history"
  FOR SELECT
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "reward_selection_read_own" ON "public"."user_reward_track_selections"
  FOR SELECT
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE EVENT TRIGGER "ensure_rls"
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION "public"."rls_auto_enable"();

COMMENT ON COLUMN "public"."users"."email" IS '[SENSITIVE]';

COMMENT ON TABLE "public"."users" IS 'This is a table containing data about the user not specific to any games';

REVOKE ALL ON FUNCTION "private"."regenerate_number_roll_energy"(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."award_selected_reward_track_points"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."award_selected_reward_track_points"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."award_selected_reward_track_points"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."grant_questline_energy"(uuid, uuid, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."grant_questline_energy"(uuid, uuid, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."grant_questline_energy"(uuid, uuid, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."grant_song_reward"(uuid, uuid, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."grant_song_reward"(uuid, uuid, text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."grant_song_reward"(uuid, uuid, text, text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."handle_auth_user_created_set_username"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."handle_auth_user_created_set_username"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_auth_user_created_set_username"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_auth_user_created_set_username"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."handle_new_auth_user"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_new_auth_user"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_new_auth_user"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."select_reward_track"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."select_reward_track"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."select_reward_track"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."select_reward_track"(uuid) TO "service_role";

REVOKE ALL ON SEQUENCE "public"."User_id_seq" FROM "anon";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."User_id_seq" TO "anon";

REVOKE ALL ON SEQUENCE "public"."User_id_seq" FROM "authenticated";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."User_id_seq" TO "authenticated";

REVOKE ALL ON SEQUENCE "public"."User_id_seq" FROM "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."User_id_seq" TO "postgres";

REVOKE ALL ON SEQUENCE "public"."User_id_seq" FROM "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."User_id_seq" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."reward_track_milestones" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."reward_track_milestones" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."reward_track_milestones" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."reward_track_milestones" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."reward_tracks" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."reward_tracks" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."reward_tracks" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."reward_tracks" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_reward_grants" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."user_reward_grants" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_reward_grants" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_reward_grants" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_reward_track_progress" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."user_reward_track_progress" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_reward_track_progress" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_reward_track_progress" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_reward_track_selection_history" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."user_reward_track_selection_history" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_reward_track_selection_history" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_reward_track_selection_history" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_reward_track_selections" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."user_reward_track_selections" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_reward_track_selections" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_reward_track_selections" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."users" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."users" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."users" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."users" TO "service_role";

