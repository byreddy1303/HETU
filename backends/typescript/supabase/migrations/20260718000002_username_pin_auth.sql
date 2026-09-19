-- Username + PIN authentication.
--
-- Model change (2026-07-18): auth moves off magic-link / Google OAuth onto
-- username + 6-digit PIN. The invite flow still gates account creation, but
-- the login channel is now entirely credential-based:
--   * Signup: invite click → /signup?invite=<token> → user picks username + PIN
--   * Login:  /auth → username + PIN → session
--
-- Under the hood, PIN becomes the Supabase Auth password. Username is a new
-- unique column on public.users. The login edge fn resolves username → email
-- server-side so the client never needs to know or type an email.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. Add username column (unique, format-checked, nullable at first so the
--    ALTER succeeds on empty tables and won't blow up if any legacy rows
--    exist without one — filled by the trigger for every new row).
-- ---------------------------------------------------------------------------

alter table public.users
  add column if not exists username text;

-- Backfill any pre-existing rows (should be zero on the live project) with
-- a stable synthesized value derived from email localpart, so we can safely
-- make the column NOT NULL below.
update public.users
  set username = regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9_]', '', 'g')
  where username is null;

-- Enforce shape: lowercase alphanumeric + underscore, 3-32 chars.
alter table public.users
  add constraint users_username_format
  check (username ~ '^[a-z0-9_]{3,32}$') not valid;

alter table public.users
  validate constraint users_username_format;

alter table public.users
  alter column username set not null;

create unique index if not exists users_username_key on public.users (lower(username));

-- ---------------------------------------------------------------------------
-- 2. Update validate_invite_signup: require username in metadata OR bootstrap.
-- ---------------------------------------------------------------------------

create or replace function public.validate_invite_signup()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  tok text;
  uname text;
begin
  uname := new.raw_user_meta_data->>'username';

  -- Enforce username shape at the auth layer too — belt+suspenders.
  if uname is null or uname !~ '^[a-z0-9_]{3,32}$' then
    raise exception 'username is required (3-32 lowercase alphanumeric or underscore chars)';
  end if;

  if exists (select 1 from public.users where lower(users.username) = lower(uname)) then
    raise exception 'username already taken';
  end if;

  -- Bootstrap: the first-ever account skips invite validation.
  if (select count(*) from public.users) = 0 then
    return new;
  end if;

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

-- ---------------------------------------------------------------------------
-- 3. Update handle_new_user: persist username from metadata to public.users.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  tok text;
  inv public.invites%rowtype;
  a uuid;
  b uuid;
  uname text;
  display_name text;
begin
  uname := new.raw_user_meta_data->>'username';
  display_name := coalesce(
    new.raw_user_meta_data->>'name',
    initcap(replace(uname, '_', ' '))
  );

  insert into public.users (id, name, email, username)
  values (
    new.id,
    display_name,
    new.email,
    uname
  )
  on conflict (id) do update
    set username = excluded.username
    where public.users.username is null;

  tok := new.raw_user_meta_data->>'invite_token';
  if tok is not null then
    select * into inv from public.invites
      where token = tok and used_by is null and expires_at > now();
    if found then
      update public.invites set used_by = new.id where id = inv.id;
      if inv.issued_by <> new.id then
        if inv.issued_by < new.id then a := inv.issued_by; b := new.id;
        else a := new.id; b := inv.issued_by; end if;
        insert into public.buddies (user_a, user_b, status)
          values (a, b, 'active')
          on conflict (user_a, user_b) do update set status = 'active';
      end if;
    end if;
  end if;

  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Helper: resolve username → auth.users.email (used by login edge fn).
--    Kept in DB so the fn stays trivial and RLS doesn't need to think about
--    it (security definer bypasses RLS for the lookup).
-- ---------------------------------------------------------------------------

create or replace function public.email_for_username(uname text)
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select au.email
  from public.users pu
  join auth.users au on au.id = pu.id
  where lower(pu.username) = lower(uname)
  limit 1;
$$;

revoke all on function public.email_for_username(text) from public;
grant execute on function public.email_for_username(text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Helper: check username availability (public — callable by anon).
-- ---------------------------------------------------------------------------

create or replace function public.is_username_available(uname text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select not exists (
    select 1 from public.users where lower(username) = lower(uname)
  );
$$;

grant execute on function public.is_username_available(text) to anon, authenticated;
