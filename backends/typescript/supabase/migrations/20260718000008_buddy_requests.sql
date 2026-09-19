-- User-initiated buddy requests + tightened chat security.
--
-- Before this migration, buddies were auto-created after invite redemption.
-- Now any user can send a request to another user by username. Only the
-- recipient can accept (→ active) or decline (→ paused with decline_reason).
--
-- Chat (buddy_messages) tightens: RLS requires status='active'. Members of
-- pending / paused / declined pairs cannot read or write messages.
--
-- Anti-enumeration: the resolve helper never reveals whether a username
-- exists; the buddy-request edge fn always returns ok.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. Add columns for request metadata + decline tracking
-- ---------------------------------------------------------------------------

alter table public.buddies
  add column if not exists requested_by uuid references public.users(id) on delete set null,
  add column if not exists responded_at timestamptz,
  add column if not exists decline_reason text,
  add column if not exists last_request_at timestamptz;

-- Backfill: existing rows were auto-created by handle_new_user with no
-- explicit requester; treat user_a as the requester for legacy legibility.
update public.buddies set requested_by = user_a where requested_by is null;

-- ---------------------------------------------------------------------------
-- 2. Anti-enumeration username lookup — service-role only
-- ---------------------------------------------------------------------------

create or replace function public.find_user_id_by_username(uname text)
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from public.users where lower(username) = lower(uname) limit 1;
$$;

revoke all on function public.find_user_id_by_username(text) from public;
grant execute on function public.find_user_id_by_username(text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Send-a-request RPC (rate-limited, atomic)
--     - Caller passes target_id (resolved server-side from username)
--     - Enforces: no self-request, no duplicate active pair, cooldown after
--       decline (24h), and per-user daily cap (20 outgoing requests).
--     - Always inserts pending. Anti-enumeration is the edge fn's job.
-- ---------------------------------------------------------------------------

create or replace function public.send_buddy_request(
  requester uuid,
  target uuid
) returns table (buddy_id uuid, created boolean, reason text)
language plpgsql security definer set search_path = public
as $$
declare
  a uuid;
  b uuid;
  existing public.buddies%rowtype;
  outgoing_today int;
begin
  if requester is null or target is null then
    return query select null::uuid, false, 'invalid'::text; return;
  end if;
  if requester = target then
    return query select null::uuid, false, 'self'::text; return;
  end if;

  -- Canonical (a,b) so the unique key matches regardless of who asks.
  if requester < target then a := requester; b := target;
  else a := target; b := requester; end if;

  -- Daily cap: 20 outgoing requests per requester per 24h.
  select count(*) into outgoing_today
    from public.buddies
    where requested_by = requester
      and last_request_at > now() - interval '1 day';
  if outgoing_today >= 20 then
    return query select null::uuid, false, 'rate_limit'::text; return;
  end if;

  select * into existing from public.buddies where user_a = a and user_b = b;
  if found then
    -- Already active or paused (still-friends) — no-op.
    if existing.status in ('active') then
      return query select existing.id, false, 'active'::text; return;
    end if;
    -- Declined recently: require 24h cooldown before re-request.
    if existing.status = 'paused'
       and existing.responded_at is not null
       and existing.responded_at > now() - interval '1 day' then
      return query select existing.id, false, 'cooldown'::text; return;
    end if;
    -- Pending with requester as requester_by — dedupe silently.
    if existing.status = 'pending' and existing.requested_by = requester then
      return query select existing.id, false, 'already_pending'::text; return;
    end if;
    -- Paused → re-open as pending from requester.
    update public.buddies
      set status = 'pending', requested_by = requester, decline_reason = null,
          responded_at = null, last_request_at = now()
      where id = existing.id;
    return query select existing.id, true, 'reopened'::text; return;
  end if;

  insert into public.buddies (user_a, user_b, status, requested_by, last_request_at)
    values (a, b, 'pending', requester, now())
    returning id into existing.id;
  return query select existing.id, true, 'new'::text;
end $$;

grant execute on function public.send_buddy_request(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Respond to a request (accept / decline). Callable directly by recipient.
-- ---------------------------------------------------------------------------

create or replace function public.respond_buddy_request(
  b_id uuid,
  action text,
  reason text default null
) returns table (buddy_id uuid, status text)
language plpgsql security definer set search_path = public
as $$
declare
  bud public.buddies%rowtype;
  uid uuid;
begin
  uid := auth.uid();
  if uid is null then raise exception 'not signed in'; end if;

  select * into bud from public.buddies where id = b_id for update;
  if not found then raise exception 'buddy row not found'; end if;
  if bud.status <> 'pending' then raise exception 'not pending'; end if;
  -- Only the party who did NOT initiate can respond.
  if bud.requested_by is null or bud.requested_by = uid then
    raise exception 'not your request to respond to';
  end if;
  if bud.user_a <> uid and bud.user_b <> uid then
    raise exception 'not a member of this pair';
  end if;

  if action = 'accept' then
    update public.buddies
      set status = 'active', responded_at = now(), decline_reason = null
      where id = b_id;
    return query select b_id, 'active'::text;
  elsif action = 'decline' then
    update public.buddies
      set status = 'paused', responded_at = now(),
          decline_reason = nullif(reason, '')
      where id = b_id;
    return query select b_id, 'paused'::text;
  else
    raise exception 'invalid action';
  end if;
end $$;

grant execute on function public.respond_buddy_request(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Tighten buddy_messages RLS: require status='active'
-- ---------------------------------------------------------------------------

create or replace function public.is_buddy_active(bid uuid, uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.buddies b
    where b.id = bid
      and b.status = 'active'
      and (b.user_a = uid or b.user_b = uid)
  );
$$;

grant execute on function public.is_buddy_active(uuid, uuid) to authenticated;

drop policy if exists sel_member on public.buddy_messages;
create policy sel_member on public.buddy_messages
  for select to authenticated
  using (public.is_buddy_active(buddy_id));

drop policy if exists ins_member on public.buddy_messages;
create policy ins_member on public.buddy_messages
  for insert to authenticated
  with check (public.is_buddy_active(buddy_id) and sender_id = auth.uid());

drop policy if exists upd_member on public.buddy_messages;
create policy upd_member on public.buddy_messages
  for update to authenticated
  using (public.is_buddy_active(buddy_id))
  with check (public.is_buddy_active(buddy_id));
