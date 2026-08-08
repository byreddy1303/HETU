-- Durable, multi-device push delivery for Buddy messages.
--
-- Browser subscriptions use standard Web Push/VAPID. Native Android/iOS
-- registrations store an FCM/APNs-compatible token (Android is wired first).
-- Every buddy_messages insert creates an outbox row in the same transaction;
-- an authenticated client can request immediate processing, while pg_cron
-- retries pending work once per minute.

set search_path = public, extensions;

alter table public.users
  add column if not exists buddy_notification_preview_enabled boolean not null default true;

create table if not exists public.push_subscriptions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  device_id         uuid not null,
  platform          text not null check (platform in ('web', 'android', 'ios')),
  web_endpoint      text,
  web_p256dh        text,
  web_auth          text,
  native_token      text,
  enabled           boolean not null default true,
  active_buddy_id   uuid references public.buddies(id) on delete set null,
  last_seen_at      timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, device_id),
  check (
    (
      platform = 'web'
      and web_endpoint is not null
      and web_p256dh is not null
      and web_auth is not null
      and native_token is null
    )
    or
    (
      platform in ('android', 'ios')
      and native_token is not null
      and web_endpoint is null
      and web_p256dh is null
      and web_auth is null
    )
  ),
  check (web_endpoint is null or char_length(web_endpoint) between 12 and 4096),
  check (web_p256dh is null or char_length(web_p256dh) between 16 and 512),
  check (web_auth is null or char_length(web_auth) between 8 and 256),
  check (native_token is null or char_length(native_token) between 16 and 4096)
);

create unique index if not exists push_subscriptions_web_endpoint_key
  on public.push_subscriptions (web_endpoint)
  where web_endpoint is not null;

create unique index if not exists push_subscriptions_native_token_key
  on public.push_subscriptions (native_token)
  where native_token is not null;

create index if not exists push_subscriptions_enabled_by_user
  on public.push_subscriptions (user_id, enabled)
  where enabled = true;

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select_self on public.push_subscriptions;
create policy push_subscriptions_select_self on public.push_subscriptions
  for select to authenticated
  using (user_id = auth.uid());

-- Writes go through narrow RPCs so a reused browser endpoint or rotated FCM
-- token can move safely from an old signed-in account to the current one.
revoke all on public.push_subscriptions from anon, authenticated;
grant select on public.push_subscriptions to authenticated;

create or replace function public.upsert_push_subscription(
  p_device_id uuid,
  p_platform text,
  p_web_endpoint text default null,
  p_web_p256dh text default null,
  p_web_auth text default null,
  p_native_token text default null
)
returns public.push_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  saved public.push_subscriptions;
begin
  if uid is null then
    raise exception 'authentication required';
  end if;
  if p_device_id is null then
    raise exception 'device id is required';
  end if;
  if p_platform not in ('web', 'android', 'ios') then
    raise exception 'unsupported push platform';
  end if;
  if p_platform = 'web' then
    if p_web_endpoint is null or p_web_endpoint !~ '^https://' or
       p_web_p256dh is null or p_web_auth is null or p_native_token is not null then
      raise exception 'invalid web push subscription';
    end if;
  elsif p_native_token is null or p_web_endpoint is not null or
        p_web_p256dh is not null or p_web_auth is not null then
    raise exception 'invalid native push subscription';
  end if;

  -- Browser endpoints and native tokens identify one physical app install.
  -- If somebody signs out and another account enables alerts on that install,
  -- ownership moves instead of allowing the prior account to keep receiving.
  delete from public.push_subscriptions
  where (p_web_endpoint is not null and web_endpoint = p_web_endpoint)
     or (p_native_token is not null and native_token = p_native_token);

  insert into public.push_subscriptions (
    user_id,
    device_id,
    platform,
    web_endpoint,
    web_p256dh,
    web_auth,
    native_token,
    enabled,
    active_buddy_id,
    last_seen_at,
    updated_at
  ) values (
    uid,
    p_device_id,
    p_platform,
    p_web_endpoint,
    p_web_p256dh,
    p_web_auth,
    p_native_token,
    true,
    null,
    now(),
    now()
  )
  on conflict (user_id, device_id) do update
    set platform = excluded.platform,
        web_endpoint = excluded.web_endpoint,
        web_p256dh = excluded.web_p256dh,
        web_auth = excluded.web_auth,
        native_token = excluded.native_token,
        enabled = true,
        active_buddy_id = null,
        last_seen_at = now(),
        updated_at = now()
  returning * into saved;

  return saved;
end;
$$;

revoke all on function public.upsert_push_subscription(uuid, text, text, text, text, text)
  from public;
grant execute on function public.upsert_push_subscription(uuid, text, text, text, text, text)
  to authenticated;

create or replace function public.unregister_push_subscription(p_device_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  delete from public.push_subscriptions
  where user_id = auth.uid() and device_id = p_device_id;
  return found;
end;
$$;

revoke all on function public.unregister_push_subscription(uuid) from public;
grant execute on function public.unregister_push_subscription(uuid) to authenticated;

create or replace function public.touch_push_subscription(
  p_device_id uuid,
  p_active_buddy_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if p_active_buddy_id is not null and not exists (
    select 1
    from public.buddies b
    where b.id = p_active_buddy_id
      and b.status = 'active'
      and (b.user_a = auth.uid() or b.user_b = auth.uid())
  ) then
    raise exception 'active buddy is not available';
  end if;

  update public.push_subscriptions
  set active_buddy_id = p_active_buddy_id,
      last_seen_at = now(),
      updated_at = now()
  where user_id = auth.uid()
    and device_id = p_device_id
    and enabled = true;
  return found;
end;
$$;

revoke all on function public.touch_push_subscription(uuid, uuid) from public;
grant execute on function public.touch_push_subscription(uuid, uuid) to authenticated;

create table if not exists public.buddy_notification_outbox (
  message_id       uuid primary key references public.buddy_messages(id) on delete cascade,
  recipient_id     uuid not null references public.users(id) on delete cascade,
  status           text not null default 'pending'
                     check (status in ('pending', 'processing', 'completed', 'dead')),
  attempts         integer not null default 0 check (attempts >= 0),
  next_attempt_at  timestamptz not null default now(),
  locked_at        timestamptz,
  completed_at     timestamptz,
  last_error       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists buddy_notification_outbox_ready
  on public.buddy_notification_outbox (next_attempt_at, created_at)
  where status in ('pending', 'processing');

alter table public.buddy_notification_outbox enable row level security;
revoke all on public.buddy_notification_outbox from anon, authenticated;

create table if not exists public.buddy_notification_deliveries (
  message_id       uuid not null references public.buddy_messages(id) on delete cascade,
  subscription_id  uuid not null references public.push_subscriptions(id) on delete cascade,
  status           text not null default 'pending'
                     check (status in ('pending', 'sent', 'suppressed', 'permanent_failure')),
  attempts         integer not null default 0 check (attempts >= 0),
  provider_status  integer,
  last_error       text,
  delivered_at     timestamptz,
  updated_at       timestamptz not null default now(),
  primary key (message_id, subscription_id)
);

alter table public.buddy_notification_deliveries enable row level security;
revoke all on public.buddy_notification_deliveries from anon, authenticated;

create or replace function public.enqueue_buddy_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
begin
  select case when b.user_a = new.sender_id then b.user_b else b.user_a end
    into recipient
  from public.buddies b
  where b.id = new.buddy_id
    and b.status = 'active'
    and new.sender_id in (b.user_a, b.user_b);

  if recipient is not null then
    insert into public.buddy_notification_outbox (message_id, recipient_id)
    values (new.id, recipient)
    on conflict (message_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists buddy_message_enqueue_notification on public.buddy_messages;
create trigger buddy_message_enqueue_notification
after insert on public.buddy_messages
for each row execute function public.enqueue_buddy_notification();

-- Atomic claim with SKIP LOCKED prevents the immediate sender request and
-- minute retry worker from processing the same message concurrently.
create or replace function public.claim_buddy_notification_jobs(
  p_limit integer default 20,
  p_message_id uuid default null
)
returns table(message_id uuid, recipient_id uuid, attempts integer)
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select job.message_id
    from public.buddy_notification_outbox job
    where (p_message_id is null or job.message_id = p_message_id)
      and (
        (job.status = 'pending' and job.next_attempt_at <= now())
        or (job.status = 'processing' and job.locked_at < now() - interval '5 minutes')
      )
      and job.attempts < 8
    order by job.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 50))
  )
  update public.buddy_notification_outbox job
  set status = 'processing',
      attempts = job.attempts + 1,
      locked_at = now(),
      updated_at = now()
  from candidates
  where job.message_id = candidates.message_id
  returning job.message_id, job.recipient_id, job.attempts;
$$;

revoke all on function public.claim_buddy_notification_jobs(integer, uuid) from public;
grant execute on function public.claim_buddy_notification_jobs(integer, uuid) to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('buddy-push-outbox')
where exists (select 1 from cron.job where jobname = 'buddy-push-outbox');

select cron.schedule(
  'buddy-push-outbox',
  '* * * * *',
  $job$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'air_journal_project_url'
      limit 1
    ) || '/functions/v1/buddy-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-air-journal-cron-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'air_journal_push_cron_secret'
        limit 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $job$
);

comment on table public.push_subscriptions is
  'Per-install, revocable Web Push or native push registrations. Tokens are visible only to their owner.';
comment on table public.buddy_notification_outbox is
  'Transactional Buddy-message push outbox with retry and dead-letter state.';
