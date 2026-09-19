-- Optional Telegram delivery for the existing daily study digest.
--
-- A subscription is created only when a signed-in user asks for a short-lived
-- connection token. The Telegram webhook consumes that token after the user
-- opens the bot and presses Start. Chat identifiers are never accepted from
-- the browser, and authenticated users can only read their own connection.

set search_path = public, extensions;

create table if not exists public.telegram_subscriptions (
  user_id                    uuid primary key references public.users(id) on delete cascade,
  chat_id                    bigint unique,
  chat_username              text check (
    chat_username is null or char_length(chat_username) between 1 and 64
  ),
  enabled                    boolean not null default false,
  connect_token              uuid unique,
  connect_token_expires_at   timestamptz,
  connected_at               timestamptz,
  last_digest_sent_on        date,
  updated_at                 timestamptz not null default now(),
  check ((chat_id is not null and connected_at is not null) or enabled = false)
);

create index if not exists telegram_subscriptions_enabled
  on public.telegram_subscriptions (enabled)
  where enabled = true;

create index if not exists telegram_subscriptions_connect_token
  on public.telegram_subscriptions (connect_token)
  where connect_token is not null;

alter table public.telegram_subscriptions enable row level security;

drop policy if exists sel_self on public.telegram_subscriptions;
create policy sel_self on public.telegram_subscriptions
  for select to authenticated
  using (user_id = auth.uid());

-- The webhook/service role owns writes. Browser clients use the narrow RPCs
-- below so a user cannot manufacture a chat id or connect somebody else.
revoke all on public.telegram_subscriptions from anon, authenticated;
grant select on public.telegram_subscriptions to authenticated;

create or replace function public.begin_telegram_connection()
returns table(token uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := auth.uid();
  next_token uuid := gen_random_uuid();
  next_expiry timestamptz := now() + interval '15 minutes';
begin
  if uid is null then
    raise exception 'authentication required';
  end if;

  insert into public.telegram_subscriptions (
    user_id,
    enabled,
    connect_token,
    connect_token_expires_at,
    updated_at
  ) values (
    uid,
    false,
    next_token,
    next_expiry,
    now()
  )
  on conflict (user_id) do update
    set connect_token = excluded.connect_token,
        connect_token_expires_at = excluded.connect_token_expires_at,
        updated_at = now();

  return query select next_token, next_expiry;
end;
$$;

revoke all on function public.begin_telegram_connection() from public;
grant execute on function public.begin_telegram_connection() to authenticated;

create or replace function public.set_telegram_digest_enabled(wants_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  has_chat boolean;
begin
  if uid is null then
    raise exception 'authentication required';
  end if;

  select chat_id is not null
    into has_chat
    from public.telegram_subscriptions
    where user_id = uid;

  if wants_enabled and coalesce(has_chat, false) = false then
    raise exception 'connect Telegram before enabling the digest';
  end if;

  update public.telegram_subscriptions
    set enabled = wants_enabled,
        updated_at = now()
    where user_id = uid;

  return found;
end;
$$;

revoke all on function public.set_telegram_digest_enabled(boolean) from public;
grant execute on function public.set_telegram_digest_enabled(boolean) to authenticated;

create or replace function public.disconnect_telegram()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'authentication required';
  end if;

  delete from public.telegram_subscriptions where user_id = uid;
  return found;
end;
$$;

revoke all on function public.disconnect_telegram() from public;
grant execute on function public.disconnect_telegram() to authenticated;

comment on table public.telegram_subscriptions is
  'Opt-in Telegram delivery state. Chat ids are bound only by telegram-webhook.';
