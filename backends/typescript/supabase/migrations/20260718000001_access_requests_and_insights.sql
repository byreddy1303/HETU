-- Access-request flow + ambient weekly-insight cache + owner helper.
-- User-directed amendment 2026-07-18: outsiders raise a request → owner is
-- notified by mail → owner approves (creates invite + sends invite mail)
-- or declines (sends decline mail). Public signup ban (BUILD §17) is intact:
-- this table only records ASKS, it never creates auth.users rows.

set search_path = public, extensions;

create extension if not exists citext;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Owner helper: first-created public.users row is the operator.
-- Every row-level policy that gates admin surfaces goes through this.
-- ---------------------------------------------------------------------------

create or replace function public.is_owner(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select u.id = uid from public.users u order by u.created_at asc limit 1
  ), false);
$$;

grant execute on function public.is_owner(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- account_requests: public form target. Owner-only visibility after insert.
-- ---------------------------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_type where typname = 'request_status_t') then
    create type request_status_t as enum ('pending','approved','declined');
  end if;
end $$;

create table if not exists public.account_requests (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null check (char_length(trim(name)) between 1 and 80),
  email         citext not null check (position('@' in email) > 1),
  purpose       text not null check (char_length(trim(purpose)) between 10 and 500),
  status        request_status_t not null default 'pending',
  notes         text,                                       -- owner-only scratchpad
  invite_id     uuid references public.invites(id) on delete set null,
  decided_by    uuid references public.users(id) on delete set null,
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  ip_hash       text,                                        -- sha256 hex from edge fn
  user_agent    text
);

comment on table public.account_requests is
  'Outsider access requests. Anon can insert; owner reads/updates. Never creates auth.users itself.';

-- One pending request per email per calendar day (soft anti-spam)
create unique index if not exists account_requests_pending_per_email_day
  on public.account_requests (email, ((created_at at time zone 'utc')::date))
  where status = 'pending';

create index if not exists account_requests_by_status
  on public.account_requests (status, created_at desc);
create index if not exists account_requests_by_email
  on public.account_requests (email);

alter table public.account_requests enable row level security;

-- Public (anon) can INSERT but never SELECT — prevents enumeration.
drop policy if exists ins_public on public.account_requests;
create policy ins_public on public.account_requests
  for insert to anon, authenticated
  with check (true);

drop policy if exists sel_owner on public.account_requests;
create policy sel_owner on public.account_requests
  for select to authenticated
  using (public.is_owner());

drop policy if exists upd_owner on public.account_requests;
create policy upd_owner on public.account_requests
  for update to authenticated
  using (public.is_owner())
  with check (public.is_owner());

drop policy if exists del_owner on public.account_requests;
create policy del_owner on public.account_requests
  for delete to authenticated
  using (public.is_owner());

grant insert on public.account_requests to anon, authenticated;
grant select, update, delete on public.account_requests to authenticated;

-- ---------------------------------------------------------------------------
-- Approval RPC: single atomic path (create invite → link → mark approved).
-- Called by the approve-request edge function using service role.
-- ---------------------------------------------------------------------------

create or replace function public.approve_account_request(
  req_id uuid,
  owner_id uuid,
  invite_ttl_days int default 7
)
returns table (invite_token text, invite_id uuid, requester_email text, requester_name text)
language plpgsql
security definer
set search_path = public
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

create or replace function public.decline_account_request(
  req_id uuid,
  owner_id uuid,
  reason text default null
)
returns table (requester_email text, requester_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.account_requests%rowtype;
begin
  select * into req from public.account_requests where id = req_id for update;
  if not found then raise exception 'request not found'; end if;
  if req.status <> 'pending' then raise exception 'request already %', req.status; end if;

  update public.account_requests
    set status     = 'declined',
        decided_by = owner_id,
        decided_at = now(),
        notes      = coalesce(reason, notes)
    where id = req_id;

  requester_email := req.email::text;
  requester_name  := req.name;
  return next;
end $$;

grant execute on function public.decline_account_request(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- insights_daily: cached one-line "this week's read" per user per day.
-- Populated by weekly-insight edge function on demand (once/day/user).
-- ---------------------------------------------------------------------------

create table if not exists public.insights_daily (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.users(id) on delete cascade,
  day           date not null default current_date,
  sentence      text not null check (char_length(sentence) between 5 and 400),
  data_hash     text not null,
  provider      llm_provider_t not null default 'groq',
  generated_at  timestamptz not null default now(),
  unique (user_id, day)
);

create index if not exists insights_daily_by_user_day
  on public.insights_daily (user_id, day desc);

alter table public.insights_daily enable row level security;

drop policy if exists sel_own on public.insights_daily;
create policy sel_own on public.insights_daily
  for select using (user_id = auth.uid());

drop policy if exists ins_own on public.insights_daily;
create policy ins_own on public.insights_daily
  for insert with check (user_id = auth.uid());

drop policy if exists del_own on public.insights_daily;
create policy del_own on public.insights_daily
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Small helper: owner email lookup (edge fns can read via service role).
-- ---------------------------------------------------------------------------

create or replace function public.owner_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select email from public.users order by created_at asc limit 1;
$$;

grant execute on function public.owner_email() to service_role;
