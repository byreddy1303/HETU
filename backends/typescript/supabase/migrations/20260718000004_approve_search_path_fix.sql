-- Fix approve_account_request: gen_random_bytes lives in the extensions
-- schema on Supabase, but the function was created with
-- `set search_path = public`, so the call failed with
--   "function gen_random_bytes(integer) does not exist".
-- Adding `extensions` to the search path resolves it. All other logic
-- (locking, invite insert, request status update) is unchanged.

set search_path = public, extensions;

create or replace function public.approve_account_request(
  req_id uuid,
  owner_id uuid,
  invite_ttl_days int default 7
)
returns table (invite_token text, invite_id uuid, requester_email text, requester_name text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  req public.account_requests%rowtype;
  new_token text;
  new_id uuid;
begin
  select * into req from public.account_requests where id = req_id for update;
  if not found then raise exception 'request not found'; end if;
  if req.status <> 'pending' then raise exception 'request already %', req.status; end if;
  if not exists (select 1 from public.users where id = owner_id) then
    raise exception 'owner not found';
  end if;

  new_token := encode(gen_random_bytes(16), 'hex');
  new_id := uuid_generate_v4();

  insert into public.invites (id, token, issued_by, expires_at)
    values (new_id, new_token, owner_id, now() + make_interval(days => invite_ttl_days));

  update public.account_requests
    set status     = 'approved',
        decided_by = owner_id,
        decided_at = now(),
        invite_id  = new_id
    where id = req_id;

  invite_token   := new_token;
  invite_id      := new_id;
  requester_email := req.email::text;
  requester_name  := req.name;
  return next;
end $$;

grant execute on function public.approve_account_request(uuid, uuid, int) to service_role;
