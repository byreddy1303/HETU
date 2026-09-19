-- Invite-only signup, enforced server-side.
-- GoTrue-level signup stays enabled; these triggers are the actual gate:
--   * first account ever created needs no invite (owner bootstrap)
--   * every later signup must carry a valid, unused, unexpired invite token
--     in raw_user_meta_data.invite_token (magic-link signup passes it via
--     options.data). Google OAuth is sign-in only for existing accounts.

create or replace function public.validate_invite_signup()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  tok text;
begin
  if (select count(*) from public.users) = 0 then
    return new; -- bootstrap: owner account
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

create trigger validate_invite_signup
  before insert on auth.users
  for each row execute function public.validate_invite_signup();

-- Provision profile + consume invite + pair buddies after a successful signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  tok text;
  inv public.invites%rowtype;
  a uuid;
  b uuid;
begin
  insert into public.users (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;

  tok := new.raw_user_meta_data->>'invite_token';
  if tok is not null then
    select * into inv from public.invites
      where token = tok and used_by is null and expires_at > now();
    if found then
      update public.invites set used_by = new.id where id = inv.id;
      if inv.issued_by < new.id then
        a := inv.issued_by; b := new.id;
      else
        a := new.id; b := inv.issued_by;
      end if;
      insert into public.buddies (user_a, user_b, status)
        values (a, b, 'active')
        on conflict (user_a, user_b) do update set status = 'active';
    end if;
  end if;

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
