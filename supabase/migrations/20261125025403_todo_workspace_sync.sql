create table public.todo_workspaces (
 user_id uuid primary key references auth.users(id) on delete cascade,
 state jsonb not null check (jsonb_typeof(state) = 'object' and (state->>'version') = '2' and jsonb_typeof(state->'tasks') = 'array' and pg_column_size(state) <= 4000000),
 revision bigint not null default 1 check (revision > 0),
 updated_at timestamptz not null default now()
);
alter table public.todo_workspaces enable row level security;
revoke all on public.todo_workspaces from public, anon, authenticated;
grant select, insert, update on public.todo_workspaces to authenticated;
create policy "owner reads workspace" on public.todo_workspaces for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner inserts workspace" on public.todo_workspaces for insert to authenticated with check ((select auth.uid()) = user_id and revision = 1);
create policy "owner updates workspace" on public.todo_workspaces for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create function public.todo_workspace_revision() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 if new.revision <> old.revision + 1 then raise exception 'invalid workspace revision' using errcode = '40001'; end if;
 new.updated_at := now();
 return new;
end;
$$;
revoke execute on function public.todo_workspace_revision() from public, anon, authenticated;
create trigger todo_workspace_revision before update on public.todo_workspaces for each row execute function public.todo_workspace_revision();
