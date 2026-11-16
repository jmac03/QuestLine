create or replace function public.get_wordle_state(p_debug boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_game public.wordle_games%rowtype;
  v_state jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;

  select * into v_game
    from public.wordle_games
   where user_id = v_user_id and status = 'playing'
   order by created_at desc limit 1;

  if not found then
    return pg_catalog.jsonb_build_object('activeGame', null);
  end if;

  v_state := pg_catalog.jsonb_build_object(
    'id', v_game.id,
    'wordLength', v_game.word_length,
    'maxGuesses', v_game.max_guesses,
    'guesses', v_game.guesses
  );

  if coalesce(p_debug, false) then
    v_state := v_state || pg_catalog.jsonb_build_object(
      'debugTarget', v_game.target_word,
      'debugStatus', v_game.status,
      'debugGuessesUsed', pg_catalog.jsonb_array_length(v_game.guesses)
    );
  end if;

  return pg_catalog.jsonb_build_object('activeGame', v_state);
end;
$$;

revoke all on function public.get_wordle_state(boolean) from public, anon;
grant execute on function public.get_wordle_state(boolean) to authenticated;