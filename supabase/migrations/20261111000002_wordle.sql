-- Letter Hunt game: extensible word bank, database-managed targets and scoring.

create table if not exists public.wordle_words (
  word text primary key,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint wordle_words_word_check
    check (word = lower(word) and word ~ '^[a-z]+$')
);

insert into public.wordle_words (word) values
  ('arc'), ('ash'), ('bay'), ('bee'), ('book'), ('bright'), ('calm'),
  ('candle'), ('canyon'), ('cedar'), ('circle'), ('cloud'), ('coast'),
  ('comet'), ('copper'), ('crane'), ('dawn'), ('dream'), ('eagle'),
  ('earth'), ('ember'), ('field'), ('flame'), ('flock'), ('forest'),
  ('garden'), ('glade'), ('glow'), ('grain'), ('harbor'), ('harmony'),
  ('heart'), ('hearth'), ('island'), ('jewel'), ('journey'), ('lantern'),
  ('laugh'), ('lemon'), ('light'), ('little'), ('meadow'), ('memory'),
  ('metal'), ('mist'), ('morning'), ('mountain'), ('music'), ('north'),
  ('ocean'), ('olive'), ('orange'), ('orbit'), ('paper'), ('path'),
  ('peace'), ('pebble'), ('planet'), ('plum'), ('prism'), ('quest'),
  ('quiet'), ('rain'), ('raven'), ('river'), ('robin'), ('rocket'),
  ('rose'), ('sail'), ('scale'), ('shadow'), ('shore'), ('silver'),
  ('sketch'), ('smile'), ('snow'), ('solar'), ('sound'), ('spark'),
  ('spring'), ('star'), ('stone'), ('story'), ('stream'), ('summer'),
  ('sunset'), ('table'), ('thunder'), ('timber'), ('travel'), ('tree'),
  ('valley'), ('velvet'), ('violet'), ('vision'), ('water'), ('whale'),
  ('window'), ('winter'), ('wonder'), ('world'), ('yellow'), ('zephyr'),
  ('friendship'), ('playground'), ('sunflower')
on conflict (word) do update
  set is_active = true;

create table if not exists public.wordle_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  word_length integer not null check (word_length between 1 and 100),
  max_guesses integer not null check (max_guesses between 1 and 20),
  target_word text not null references public.wordle_words(word),
  guesses jsonb not null default '[]'::jsonb,
  status text not null default 'playing'
    check (status in ('playing', 'won', 'lost')),
  score integer not null default 0 check (score >= 0),
  applied_track_id uuid references public.reward_tracks(id),
  reward_points bigint not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists wordle_games_user_created_idx
  on public.wordle_games (user_id, created_at desc);

-- Required for the milestone-grant ON CONFLICT clause below.
create unique index if not exists user_reward_grants_user_milestone_uidx
  on public.user_reward_grants (user_id, milestone_id);

alter table public.wordle_words enable row level security;
alter table public.wordle_games enable row level security;

revoke all on table public.wordle_words, public.wordle_games
  from public, anon, authenticated;

create or replace function public.get_wordle_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_game public.wordle_games%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;

  select *
    into v_game
    from public.wordle_games
   where user_id = v_user_id
     and status = 'playing'
   order by created_at desc
   limit 1;

  if not found then
    return jsonb_build_object('activeGame', null);
  end if;

  return jsonb_build_object(
    'activeGame',
    jsonb_build_object(
      'id', v_game.id,
      'wordLength', v_game.word_length,
      'maxGuesses', v_game.max_guesses,
      'guesses', v_game.guesses
    )
  );
end;
$$;

create or replace function public.start_wordle_game(
  p_word_length integer,
  p_max_guesses integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_game public.wordle_games%rowtype;
  v_word text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;

  if p_word_length is null or p_word_length not between 1 and 100 then
    raise exception 'Invalid word length';
  end if;

  if p_max_guesses is null or p_max_guesses not between 1 and 20 then
    raise exception 'Invalid number of guesses';
  end if;

  select word
    into v_word
    from public.wordle_words
   where is_active
     and char_length(word) = p_word_length
   order by random()
   limit 1;

  if v_word is null then
    raise exception 'No words are available for that length';
  end if;

  insert into public.wordle_games (
    user_id, word_length, max_guesses, target_word
  )
  values (
    v_user_id, p_word_length, p_max_guesses, v_word
  )
  returning * into v_game;

  return jsonb_build_object(
    'id', v_game.id,
    'wordLength', v_game.word_length,
    'maxGuesses', v_game.max_guesses,
    'guesses', v_game.guesses
  );
end;
$$;

create or replace function public.submit_wordle_guess(
  p_game_id uuid,
  p_guess text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_game public.wordle_games%rowtype;
  v_guess text := lower(pg_catalog.btrim(p_guess));
  v_feedback jsonb := '[]'::jsonb;
  v_statuses text[];
  v_remaining text;
  v_index integer;
  v_target_pos integer;
  v_won boolean;
  v_lost boolean;
  v_score integer := 0;
  v_modifier numeric;
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

  select *
    into v_game
    from public.wordle_games
   where id = p_game_id
     and user_id = v_user_id
   for update;

  if not found then
    raise exception 'Game not found';
  end if;

  if v_game.status <> 'playing' then
    raise exception 'This game is already complete';
  end if;

  if v_guess is null
     or v_guess !~ '^[a-z]+$'
     or char_length(v_guess) <> v_game.word_length then
    raise exception 'Guess must be % letters', v_game.word_length;
  end if;

  if not exists (
    select 1
      from public.wordle_words
     where word = v_guess
       and is_active
  ) then
    raise exception 'That word is not in the word bank';
  end if;

  if exists (
    select 1
      from jsonb_array_elements_text(v_game.guesses) as old_guess
     where old_guess = v_guess
  ) then
    raise exception 'You already tried that word';
  end if;

  -- Mark exact matches first and remove those target letters from the
  -- remaining pool, so repeated letters get correct feedback.
  v_statuses := pg_catalog.array_fill(
    'absent'::text,
    array[v_game.word_length]
  );
  v_remaining := v_game.target_word;

  for v_index in 1..v_game.word_length loop
    if pg_catalog.substr(v_guess, v_index, 1)
       = pg_catalog.substr(v_game.target_word, v_index, 1) then
      v_statuses[v_index] := 'correct';
      v_remaining := overlay(v_remaining placing '#' from v_index for 1);
    end if;
  end loop;

  -- Mark remaining letters present only if an unused matching target
  -- letter remains.
  for v_index in 1..v_game.word_length loop
    if v_statuses[v_index] <> 'correct' then
      v_target_pos := pg_catalog.strpos(
        v_remaining,
        pg_catalog.substr(v_guess, v_index, 1)
      );

      if v_target_pos > 0 then
        v_statuses[v_index] := 'present';
        v_remaining := overlay(
          v_remaining placing '#' from v_target_pos for 1
        );
      end if;
    end if;
  end loop;

  for v_index in 1..v_game.word_length loop
    v_feedback := v_feedback || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'letter', pg_catalog.substr(v_guess, v_index, 1),
        'status', v_statuses[v_index]
      )
    );
  end loop;

  v_won := v_guess = v_game.target_word;
  v_lost := not v_won
    and pg_catalog.jsonb_array_length(v_game.guesses) + 1
      >= v_game.max_guesses;

  if v_won then
    -- Three letters = 0.70x, five letters = 1.00x.
    -- More guesses lower the score ceiling.
    v_modifier := 0.7 + ((v_game.word_length - 3) * 0.15);
    v_score := greatest(
      1,
      pg_catalog.round(
        100 * v_modifier
        * (6::numeric / v_game.max_guesses)
        * (
          (v_game.max_guesses - pg_catalog.jsonb_array_length(v_game.guesses))::numeric
          / v_game.max_guesses
        )
      )
    )::integer;
  end if;

  update public.wordle_games
     set guesses = guesses || pg_catalog.jsonb_build_array(
           pg_catalog.jsonb_build_object(
             'word', v_guess,
             'feedback', v_feedback
           )
         ),
         status = case
           when v_won then 'won'
           when v_lost then 'lost'
           else 'playing'
         end,
         score = v_score,
         completed_at = case
           when v_won or v_lost then now()
           else null
         end
   where id = v_game.id;

  if v_won and v_score > 0 then
    select s.track_id, t.score_step, t.points_per_score_milestone
      into v_track_id, v_score_step, v_points_per_marker
      from public.user_reward_track_selections as s
      join public.reward_tracks as t
        on t.id = s.track_id
       and t.is_active
     where s.user_id = v_user_id
     for share of s, t;

    if v_track_id is not null then
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

      v_points_earned :=
        pg_catalog.floor(
          (v_score_remainder + v_score)::numeric / v_score_step
        )::bigint * v_points_per_marker;

      v_new_remainder := pg_catalog.mod(
        v_score_remainder + v_score,
        v_score_step
      );
      v_new_points := v_previous_points + v_points_earned;

      update public.user_reward_track_progress
         set points = v_new_points,
             score_remainder = v_new_remainder,
             last_score_marker = last_score_marker + v_score,
             updated_at = now()
       where user_id = v_user_id
         and track_id = v_track_id;

      insert into public.user_reward_grants (
        user_id, milestone_id, track_id, reward_name, reward_payload
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
  end if;

  update public.wordle_games
     set applied_track_id = v_track_id,
         reward_points = v_points_earned
   where id = v_game.id;

  return pg_catalog.jsonb_build_object(
    'guess', v_guess,
    'feedback', v_feedback,
    'won', v_won,
    'lost', v_lost,
    'score', v_score,
    'answer', case
      when v_won or v_lost then v_game.target_word
      else null
    end,
    'guessesUsed', pg_catalog.jsonb_array_length(v_game.guesses) + 1,
    'maxGuesses', v_game.max_guesses,
    'rewardPoints', v_points_earned
  );
end;
$$;

revoke all on function public.get_wordle_state()
  from public, anon;
revoke all on function public.start_wordle_game(integer, integer)
  from public, anon;
revoke all on function public.submit_wordle_guess(uuid, text)
  from public, anon;

grant execute on function public.get_wordle_state()
  to authenticated;
grant execute on function public.start_wordle_game(integer, integer)
  to authenticated;
grant execute on function public.submit_wordle_guess(uuid, text)
  to authenticated;