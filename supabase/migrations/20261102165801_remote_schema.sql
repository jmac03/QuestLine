-- Keep one signup trigger. Both old triggers inserted into public.users.
DROP TRIGGER IF EXISTS users_auth_signup_set_username ON auth.users;
DROP TRIGGER IF EXISTS create_public_user_after_auth_signup ON auth.users;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_username text;
BEGIN
  v_username := coalesce(
    new.raw_user_meta_data ->> 'username',
    new.raw_user_meta_data ->> 'name',
    new.email
  );

  -- Link an existing, unlinked profile with the same non-null email.
  IF new.email IS NOT NULL THEN
    UPDATE public.users AS u
       SET auth_user_id = new.id,
           username = coalesce(u.username, v_username)
     WHERE u.email = new.email
       AND u.auth_user_id IS NULL;

    IF FOUND THEN
      RETURN new;
    END IF;
  END IF;

  INSERT INTO public.users (auth_user_id, email, username)
  VALUES (new.id, new.email, v_username)
  ON CONFLICT (auth_user_id) DO UPDATE
    SET email = coalesce(public.users.email, excluded.email),
        username = coalesce(public.users.username, excluded.username);

  RETURN new;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_new_auth_user()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER create_public_user_after_auth_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();


-- Remove client table privileges, including TRUNCATE and TRIGGER.
REVOKE ALL PRIVILEGES ON TABLE
  public.reward_tracks,
  public.reward_track_milestones,
  public.user_reward_grants,
  public.user_reward_track_progress,
  public.user_reward_track_selection_history,
  public.user_reward_track_selections,
  public.users
FROM PUBLIC, anon, authenticated;

-- Client access is read-only and remains subject to RLS.
GRANT SELECT ON TABLE
  public.reward_tracks,
  public.reward_track_milestones,
  public.user_reward_grants,
  public.user_reward_track_progress,
  public.user_reward_track_selection_history,
  public.user_reward_track_selections
TO authenticated;

-- No client-facing policy for public.users is defined here.
REVOKE ALL PRIVILEGES ON SEQUENCE public."User_id_seq"
  FROM PUBLIC, anon, authenticated;


-- Client RPCs.
REVOKE ALL ON FUNCTION public.get_roll_state()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_roll_state()
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.roll_number(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.roll_number(uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.select_reward_track(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.select_reward_track(uuid)
  TO authenticated, service_role;


-- Preserve the existing five-argument grant_song_reward setup.
-- This changes only its EXECUTE privileges, not its implementation.
REVOKE ALL ON FUNCTION
  public.grant_song_reward(uuid, uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.grant_song_reward(uuid, uuid, text, text, uuid)
  TO service_role;

-- Server-side energy grants only.
REVOKE ALL ON FUNCTION
  public.grant_questline_energy(uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.grant_questline_energy(uuid, uuid, integer)
  TO service_role;