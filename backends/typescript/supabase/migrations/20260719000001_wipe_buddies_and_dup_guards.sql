-- Harden signup / access-request paths against duplicates without changing
-- existing Buddy pairs or message history.
--
-- Sections:
--   1. Preserve existing Buddy data. An earlier local draft reset these
--      tables, but that is not safe for a production migration.
--   2. Case-insensitive uniqueness on public.users.email (belt to the base
--      column's case-sensitive unique constraint).
--   3. One pending access request per email — the same person can't spam
--      the owner inbox with 20 pending rows.
--   4. Extend validate_invite_signup so it rejects a signup whose email is
--      already in public.users or auth.users (case-insensitive). Preserves
--      the existing username + invite-token checks.
--
-- Rollback: the unique indexes and function update can be dropped/restored
-- from the previous migration if needed.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. Preserve buddies + messages
-- ---------------------------------------------------------------------------
-- Production data is intentionally left untouched.

-- ---------------------------------------------------------------------------
-- 2. Case-insensitive uniqueness on users.email
-- ---------------------------------------------------------------------------

create unique index if not exists users_email_lower_key
  on public.users (lower(email));

-- ---------------------------------------------------------------------------
-- 3. One pending access request per email
-- ---------------------------------------------------------------------------

create unique index if not exists account_requests_pending_email_key
  on public.account_requests (lower(email))
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- 4. Extend validate_invite_signup to include email dedup
-- ---------------------------------------------------------------------------
-- Preserves the existing username-format, username-uniqueness, and invite
-- token validation from migration 20260718000003_no_bootstrap.sql. The only
-- addition is the email dedup check at the top.

create or replace function public.validate_invite_signup()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  tok text;
  uname text;
  incoming_email text;
begin
  incoming_email := lower(coalesce(new.email, ''));

  -- Email dedup: reject if the same email exists in public.users or in
  -- auth.users (case-insensitive). auth.users already has its own unique
  -- constraint on email, but we do a friendly, explicit check first so the
  -- error message is clear.
  if incoming_email <> '' then
    if exists (
      select 1 from public.users where lower(email) = incoming_email
    ) then
      raise exception 'an account with this email already exists'
        using errcode = '23505';
    end if;
    if exists (
      select 1 from auth.users
      where lower(email) = incoming_email
        and id <> new.id
    ) then
      raise exception 'an account with this email already exists'
        using errcode = '23505';
    end if;
  end if;

  -- Username presence + format (unchanged).
  uname := new.raw_user_meta_data->>'username';
  if uname is null or uname !~ '^[a-z0-9_]{3,32}$' then
    raise exception 'username is required (3-32 lowercase alphanumeric or underscore chars)';
  end if;
  if exists (
    select 1 from public.users where lower(users.username) = lower(uname)
  ) then
    raise exception 'username already taken';
  end if;

  -- Invite token presence + validity (unchanged).
  tok := new.raw_user_meta_data->>'invite_token';
  if tok is null then
    raise exception 'signup is invite-only';
  end if;
  if not exists (
    select 1 from public.invites
    where token = tok and used_by is null and expires_at > now()
  ) then
    raise exception 'invalid or expired invite';
  end if;

  return new;
end $$;

comment on function public.validate_invite_signup() is
  'Invite-only signup guard + case-insensitive email dedup + username dedup. '
  'Rejects any auth.users insert whose email already exists (public.users or '
  'auth.users), whose username is taken or malformed, or which lacks a valid '
  'unused unexpired invite token.';
