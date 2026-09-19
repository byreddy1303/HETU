-- Drop the bootstrap exemption from validate_invite_signup.
-- The owner already exists; from here on, EVERY signup must present a valid,
-- unused, unexpired invite token in raw_user_meta_data. If the owner ever
-- loses their account, recovery is a SQL/CLI task, not a public signup path.

set search_path = public, extensions;

create or replace function public.validate_invite_signup()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  tok text;
  uname text;
begin
  uname := new.raw_user_meta_data->>'username';

  if uname is null or uname !~ '^[a-z0-9_]{3,32}$' then
    raise exception 'username is required (3-32 lowercase alphanumeric or underscore chars)';
  end if;

  if exists (select 1 from public.users where lower(users.username) = lower(uname)) then
    raise exception 'username already taken';
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
