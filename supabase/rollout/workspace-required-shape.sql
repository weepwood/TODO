-- Staged repair only. Existing malformed rows make the transaction fail;
-- do not silently rewrite or discard user data. Apply through a reviewed
-- migration after a production read-only inventory and backup.
begin;
alter table public.todo_workspaces
 add constraint todo_workspace_required_shape
 check ((jsonb_typeof(state) = 'object'
   and state->>'version' = '2'
   and jsonb_typeof(state->'tasks') = 'array') is true);
commit;
