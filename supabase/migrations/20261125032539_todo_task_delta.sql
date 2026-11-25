create or replace function public.todo_apply_task_delta(p_revision bigint,p_tasks jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare uid uuid := auth.uid(); current_state jsonb; next_tasks jsonb; new_revision bigint; changed_at timestamptz;
begin
 if uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 if p_revision is null or p_revision<1 or p_tasks is null or jsonb_typeof(p_tasks)<>'array' then raise exception 'invalid delta' using errcode='22023'; end if;
 if jsonb_array_length(p_tasks)<1 or jsonb_array_length(p_tasks)>500 or octet_length(p_tasks::text)>1000000 then raise exception 'delta too large' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(p_tasks) t where jsonb_typeof(t)<>'object' or jsonb_typeof(t->'id') is distinct from 'string' or length(t->>'id') not between 1 and 200)
 or (select count(distinct t->>'id') from jsonb_array_elements(p_tasks) t)<>jsonb_array_length(p_tasks) then raise exception 'invalid task identifiers' using errcode='22023'; end if;
 select w.state into current_state from public.todo_workspaces w where w.user_id=uid and w.revision=p_revision for update;
 if not found then return null; end if;
 with edits as (select value as item, ordinality as pos from jsonb_array_elements(p_tasks) with ordinality),
 old_tasks as (select value as item, ordinality as pos from jsonb_array_elements(current_state->'tasks') with ordinality),
 merged as (
 select coalesce(e.item,o.item) as item,o.pos from old_tasks o left join edits e on e.item->>'id'=o.item->>'id'
 union all
 select e.item,jsonb_array_length(current_state->'tasks')+e.pos from edits e where not exists(select 1 from old_tasks o where o.item->>'id'=e.item->>'id')
 )
 select coalesce(jsonb_agg(item order by pos),'[]'::jsonb) into next_tasks from merged;
 update public.todo_workspaces w set state=jsonb_set(current_state,'{tasks}',next_tasks),revision=w.revision+1 where w.user_id=uid and w.revision=p_revision returning w.revision,w.updated_at into new_revision,changed_at;
 if not found then return null; end if;
 return jsonb_build_object('revision',new_revision,'updated_at',changed_at);
end;
$$;
revoke all on function public.todo_apply_task_delta(bigint,jsonb) from public,anon,authenticated;
grant execute on function public.todo_apply_task_delta(bigint,jsonb) to authenticated;
-- Publish only revision metadata, never the full task snapshot.
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='todo_workspaces') then
 alter publication supabase_realtime add table public.todo_workspaces (user_id,revision,updated_at);
 end if;
end $$;
