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
