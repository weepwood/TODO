alter table public.todo_workspaces add column if not exists task_deltas jsonb not null default '[]'::jsonb;
create or replace function public.todo_capture_task_delta()
returns trigger language plpgsql security invoker set search_path='' as $$
declare edits jsonb; entry jsonb; history jsonb; old_count integer; new_count integer;
begin
 new.task_deltas:='[]'::jsonb;
 if tg_op='INSERT' then return new; end if;
 if new.revision<>old.revision+1 or new.state-'tasks' is distinct from old.state-'tasks' then return new; end if;
 old_count:=jsonb_array_length(old.state->'tasks');new_count:=jsonb_array_length(new.state->'tasks');
 if new_count<old_count or new_count>100000 then return new; end if;
 if exists(select 1 from jsonb_array_elements(new.state->'tasks') t where jsonb_typeof(t->'id') is distinct from 'string' or length(t->>'id') not between 1 and 200) or
 (select count(distinct t->>'id') from jsonb_array_elements(new.state->'tasks') t)<>new_count then return new;end if;
 if exists(select 1 from jsonb_array_elements(old.state->'tasks') with ordinality o(item,pos) join jsonb_array_elements(new.state->'tasks') with ordinality n(item,pos) using(pos) where o.item->>'id' is distinct from n.item->>'id') then return new;end if;
 select coalesce(jsonb_agg(n.item order by n.pos),'[]'::jsonb) into edits from jsonb_array_elements(new.state->'tasks') with ordinality n(item,pos) left join jsonb_array_elements(old.state->'tasks') with ordinality o(item,pos) using(pos) where n.item is distinct from o.item;
 if jsonb_array_length(edits)>500 then return new;end if;
 entry:=jsonb_build_object('from',old.revision,'to',new.revision,'tasks',edits);
 if octet_length(entry::text)>262144 or octet_length(entry::text)>=octet_length(new.state::text)*0.75 then return new;end if;
 history:=old.task_deltas||jsonb_build_array(entry);
 while jsonb_array_length(history)>8 or octet_length(history::text)>262144 loop history:=history-0;end loop;
 new.task_deltas:=history;return new;
exception when others then
 -- Optimization only; never make an otherwise valid legacy write depend on history.
 new.task_deltas:='[]'::jsonb;return new;
end;$$;
revoke all on function public.todo_capture_task_delta() from public,anon,authenticated;
create trigger zz_todo_capture_task_delta before insert or update on public.todo_workspaces for each row execute function public.todo_capture_task_delta();
create or replace function public.todo_read_task_deltas(p_revision bigint)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); r record; patch jsonb; chain jsonb:='[]'::jsonb; expected bigint:=p_revision;
begin
 if uid is null then raise exception 'authentication required' using errcode='42501';end if;
 if p_revision is null or p_revision<1 then return null;end if;
 select revision,updated_at,task_deltas into r from public.todo_workspaces where user_id=uid;
 if not found or r.revision<=p_revision then return null;end if;
 for patch in select value from jsonb_array_elements(r.task_deltas) loop
  if (patch->>'from')::bigint<expected then continue;end if;
  if (patch->>'from')::bigint<>expected or (patch->>'to')::bigint<>expected+1 then return null;end if;
  chain:=chain||jsonb_build_array(patch);expected:=expected+1;
 end loop;
 if expected<>r.revision then return null;end if;
 return jsonb_build_object('revision',r.revision,'updated_at',r.updated_at,'patches',chain);
end;$$;
revoke all on function public.todo_read_task_deltas(bigint) from public,anon,authenticated;
grant execute on function public.todo_read_task_deltas(bigint) to authenticated;
