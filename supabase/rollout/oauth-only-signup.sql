-- Staged setup, NOT an applied migration. Enable the Auth hook separately
-- after live OAuth validation; keep the email provider enabled for login.
begin;
create schema if not exists todo_auth_private;
revoke all on schema todo_auth_private from public, anon, authenticated;
grant usage on schema todo_auth_private to supabase_auth_admin;
create or replace function todo_auth_private.allow_oauth_signup(event jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
 select case when event->'user'->'app_metadata'->>'provider' in ('github','google','azure')
   then '{}'::jsonb
   else jsonb_build_object('error',jsonb_build_object('http_code',403,'message','New accounts require GitHub, Google or Microsoft sign-in.'))
 end;
$$;
revoke all on function todo_auth_private.allow_oauth_signup(jsonb) from public, anon, authenticated;
grant execute on function todo_auth_private.allow_oauth_signup(jsonb) to supabase_auth_admin;
commit;
