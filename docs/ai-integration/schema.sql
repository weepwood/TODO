-- Candidate only. Apply through a reviewed Supabase migration after explicit authorization.
-- This script has no access to production; the local test cluster supplies auth.users/roles.
begin;
create table public.todo_external_tokens (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 label text not null check(length(label) between 1 and 80),
 automatic boolean not null default false,
 expires_at timestamptz not null default (now()+interval '90 days'),
 revoked_at timestamptz,
 created_at timestamptz not null default now()
);
create table public.todo_external_requests (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 token_id uuid not null references public.todo_external_tokens(id) on delete cascade,
 request_key text not null check(length(request_key) between 1 and 128),
 tasks jsonb not null check(jsonb_typeof(tasks)='array' and jsonb_array_length(tasks) between 1 and 50 and octet_length(tasks::text)<=262144),
 status text not null default 'received' check(status in ('received','saved','rejected')),
 task_ids jsonb not null default '[]',
 revision bigint,
 created_at timestamptz not null default now(),
 saved_at timestamptz,
 unique(token_id,request_key)
);
create index todo_external_requests_token_time on public.todo_external_requests(token_id,created_at desc);
create index todo_external_requests_owner on public.todo_external_requests(owner_id,created_at desc);
alter table public.todo_external_tokens enable row level security;
alter table public.todo_external_requests enable row level security;
revoke all on public.todo_external_tokens,public.todo_external_requests from public,anon,authenticated;
grant select,insert,update on public.todo_external_tokens,public.todo_external_requests to service_role;
grant select,update on public.todo_workspaces to service_role;

-- Only the server-side trusted gateway can call this. User JWT verification is outside SQL.
create function public.todo_external_gateway(p_action text,p_owner uuid,p_hash text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare tok public.todo_external_tokens%rowtype; req public.todo_external_requests%rowtype;
 uid uuid; w public.todo_workspaces%rowtype; result jsonb; ids jsonb; inserted jsonb;
begin
 if (p_owner is null)=(p_hash is null) then return jsonb_build_object('error','unauthorized','status',401); end if;
 if p_hash is not null then
  select * into tok from public.todo_external_tokens where token_hash=p_hash and revoked_at is null and expires_at>now() for update;
  if not found then return jsonb_build_object('error','unauthorized','status',401);end if;
  uid:=tok.owner_id;
  if p_action not in ('submit','read','workspace','commit') then return jsonb_build_object('error','forbidden','status',403);end if;
 else uid:=p_owner;end if;
 if p_action='issue' then
  insert into public.todo_external_tokens(owner_id,token_hash,label,automatic) values(uid,p_payload->>'hash',p_payload->>'label',(p_payload->>'automatic')::boolean) returning * into tok;
  return to_jsonb(tok)-'token_hash'-'owner_id';
 elsif p_action='tokens' then
  select coalesce(jsonb_agg(to_jsonb(t)-'token_hash'-'owner_id' order by created_at desc),'[]') into result from public.todo_external_tokens t where owner_id=uid;
  return result;
 elsif p_action='revoke' then
  update public.todo_external_tokens set revoked_at=coalesce(revoked_at,now()) where owner_id=uid and id=(p_payload->>'id')::uuid returning * into tok;
  if not found then return jsonb_build_object('error','not found','status',404);end if;
  return to_jsonb(tok)-'token_hash'-'owner_id';
 elsif p_action='pending' then
  select coalesce(jsonb_agg(to_jsonb(q)-'owner_id'-'request_key' order by created_at),'[]') into result from
   (select r.*,t.label as source from public.todo_external_requests r join public.todo_external_tokens t on t.id=r.token_id where r.owner_id=uid and r.status='received' order by r.created_at limit 50) q;
  return result;
 elsif p_action='submit' then
  if p_hash is null then return jsonb_build_object('error','forbidden','status',403);end if;
  select * into req from public.todo_external_requests where token_id=tok.id and request_key=p_payload->>'key';
  if found then
   if req.tasks is distinct from p_payload->'tasks' then return jsonb_build_object('error','idempotency conflict','status',409);end if;
  else
   -- Per-token serialization and bounded pending backlog.
   if (select count(*) from public.todo_external_requests where token_id=tok.id and status='received')>=100 then return jsonb_build_object('error','pending limit','status',429);end if;
   if (select count(*) from public.todo_external_requests where token_id=tok.id and created_at>now()-interval '1 minute')>=60 then return jsonb_build_object('error','request rate limit','status',429);end if;
   insert into public.todo_external_requests(owner_id,token_id,request_key,tasks) values(uid,tok.id,p_payload->>'key',p_payload->'tasks') returning * into req;
  end if;
  return (to_jsonb(req)-'owner_id'-'request_key')||jsonb_build_object('automatic',tok.automatic);
 end if;
 select * into req from public.todo_external_requests where id=(p_payload->>'id')::uuid and owner_id=uid and (p_hash is null or token_id=tok.id) for update;
 if not found then return jsonb_build_object('error','not found','status',404);end if;
 if p_action='read' then return to_jsonb(req)-'owner_id'-'request_key';end if;
 if p_action='reject' then
  if req.status='received' then update public.todo_external_requests set status='rejected' where id=req.id returning * into req;end if;
  return to_jsonb(req)-'owner_id'-'request_key';
 end if;
 if p_action not in ('workspace','commit') or (p_hash is not null and not tok.automatic) then return jsonb_build_object('error','forbidden','status',403);end if;
 if req.status<>'received' then return jsonb_build_object('request',to_jsonb(req)-'owner_id'-'request_key');end if;
 select * into w from public.todo_workspaces where user_id=uid for update;
 if not found then return jsonb_build_object('error','initialize workspace first','status',409);end if;
 if p_action='workspace' then return jsonb_build_object('request',to_jsonb(req)-'owner_id'-'request_key','state',w.state,'revision',w.revision);end if;
 if w.revision<>(p_payload->>'revision')::bigint then return jsonb_build_object('error','revision conflict','status',409,'retry',true);end if;
 inserted:=p_payload->'tasks';
 if jsonb_typeof(inserted) is distinct from 'array' or jsonb_array_length(inserted)<>jsonb_array_length(req.tasks) or jsonb_array_length(w.state->'tasks')+jsonb_array_length(inserted)>100000
 or exists(select 1 from jsonb_array_elements(inserted) with ordinality n(item,pos) where n.item->>'id' is distinct from req.id::text||':'||n.pos::text or not exists(select 1 from jsonb_array_elements(w.state->'lists') l where l->>'id'=n.item->>'listId') or exists(select 1 from jsonb_array_elements(w.state->'tasks') t where t->>'id'=n.item->>'id'))
 then return jsonb_build_object('error','invalid append','status',409);end if;
 select jsonb_agg(item->>'id' order by pos) into ids from jsonb_array_elements(inserted) with ordinality n(item,pos);
 if octet_length(jsonb_set(w.state,'{tasks}',w.state->'tasks'||inserted)::text)>3500000 then return jsonb_build_object('error','workspace capacity','status',409);end if;
 update public.todo_workspaces set state=jsonb_set(w.state,'{tasks}',w.state->'tasks'||inserted),revision=w.revision+1 where user_id=uid returning revision into w.revision;
 update public.todo_external_requests set status='saved',revision=w.revision,task_ids=ids,saved_at=now() where id=req.id returning * into req;
 return jsonb_build_object('request',to_jsonb(req)-'owner_id'-'request_key');
end;
$$;
revoke all on function public.todo_external_gateway(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.todo_external_gateway(text,uuid,text,jsonb) to service_role;
commit;
