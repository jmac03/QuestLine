-- Song rewards backed by the app's local song catalog.
--
-- Songs are not stored in Supabase yet. The song ID must match an entry in
-- song-rewards.js, for example: big-waves.

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

-- Reward creation must stay server-controlled. Call this from trusted
-- backend/admin code, not from the browser.
revoke all on function public.grant_song_reward(uuid, uuid, text, text, uuid) from public;
revoke all on function public.grant_song_reward(uuid, uuid, text, text, uuid) from anon;
revoke all on function public.grant_song_reward(uuid, uuid, text, text, uuid) from authenticated;
grant execute on function public.grant_song_reward(uuid, uuid, text, text, uuid) to service_role;
