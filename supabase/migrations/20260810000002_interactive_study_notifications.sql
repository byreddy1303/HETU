-- Opt-in, per-module daily study reminders plus secure notification actions.
-- Buddy remains event-driven; study reminders require their own master consent.

set search_path = public, extensions;

alter table public.users
  add column if not exists study_notifications_enabled boolean not null default false;

alter table public.push_subscriptions
  add column if not exists buddy_enabled boolean not null default false,
  add column if not exists study_enabled boolean not null default false;

-- Every registration that predates this migration was created only through
-- the explicit Buddy opt-in flow. Preserve that consent during the split.
update public.push_subscriptions set buddy_enabled = true;

create or replace function public.set_push_subscription_channels(
  p_device_id uuid,
  p_buddy_enabled boolean default null,
  p_study_enabled boolean default null
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
  update public.push_subscriptions
  set buddy_enabled = coalesce(p_buddy_enabled, buddy_enabled),
      study_enabled = coalesce(p_study_enabled, study_enabled),
      enabled = true,
      updated_at = now()
  where user_id = auth.uid()
    and device_id = p_device_id;
  return found;
end;
$$;

revoke all on function public.set_push_subscription_channels(uuid, boolean, boolean) from public;
grant execute on function public.set_push_subscription_channels(uuid, boolean, boolean)
  to authenticated;

create table if not exists public.study_notification_preferences (
  user_id       uuid not null references public.users(id) on delete cascade,
  category      text not null check (category in (
    'dashboard', 'planner', 'reattempts', 'pyq', 'sessions', 'journal',
    'patterns', 'heatmap', 'calibration', 'readiness', 'trigger_drill',
    'formulas', 'syllabus', 'weekly_review'
  )),
  enabled       boolean not null default true,
  hour_local    smallint not null check (hour_local between 0 and 23),
  minute_local  smallint not null default 0 check (minute_local in (0, 15, 30, 45)),
  last_sent_on  date,
  muted_until   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_id, category)
);

create index if not exists study_notification_preferences_due
  on public.study_notification_preferences (enabled, hour_local, minute_local, last_sent_on)
  where enabled = true;

alter table public.study_notification_preferences enable row level security;

drop policy if exists study_notification_preferences_select_self
  on public.study_notification_preferences;
create policy study_notification_preferences_select_self
  on public.study_notification_preferences
  for select to authenticated using (user_id = auth.uid());

drop policy if exists study_notification_preferences_update_self
  on public.study_notification_preferences;
create policy study_notification_preferences_update_self
  on public.study_notification_preferences
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.study_notification_preferences from anon, authenticated;
grant select, update on public.study_notification_preferences to authenticated;

create or replace function public.seed_study_notification_preferences(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.study_notification_preferences (user_id, category, hour_local, minute_local)
  values
    (p_user_id, 'dashboard',      6,  0),
    (p_user_id, 'planner',        6, 45),
    (p_user_id, 'reattempts',     7, 30),
    (p_user_id, 'pyq',            9,  0),
    (p_user_id, 'sessions',      10, 30),
    (p_user_id, 'formulas',      12,  0),
    (p_user_id, 'syllabus',      13, 30),
    (p_user_id, 'patterns',      15,  0),
    (p_user_id, 'trigger_drill', 16, 30),
    (p_user_id, 'calibration',   18,  0),
    (p_user_id, 'readiness',     19,  0),
    (p_user_id, 'heatmap',       19, 45),
    (p_user_id, 'journal',       20, 30),
    (p_user_id, 'weekly_review', 21, 30)
  on conflict (user_id, category) do nothing;
$$;

revoke all on function public.seed_study_notification_preferences(uuid) from public;
grant execute on function public.seed_study_notification_preferences(uuid) to service_role;

create or replace function public.ensure_study_notification_preferences()
returns setof public.study_notification_preferences
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
  perform public.seed_study_notification_preferences(uid);
  return query
    select preference.*
    from public.study_notification_preferences preference
    where preference.user_id = uid
    order by preference.hour_local, preference.minute_local, preference.category;
end;
$$;

revoke all on function public.ensure_study_notification_preferences() from public;
grant execute on function public.ensure_study_notification_preferences() to authenticated;

create or replace function public.seed_study_notifications_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_study_notification_preferences(new.id);
  return new;
end;
$$;

drop trigger if exists users_seed_study_notifications on public.users;
create trigger users_seed_study_notifications
after insert on public.users
for each row execute function public.seed_study_notifications_for_new_user();

select public.seed_study_notification_preferences(existing.id)
from public.users existing;

create table if not exists public.study_notification_events (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  subscription_id   uuid not null references public.push_subscriptions(id) on delete cascade,
  category          text not null,
  local_date        date not null,
  title             text not null check (char_length(title) between 1 and 120),
  body              text not null check (char_length(body) between 1 and 500),
  route             text not null check (route ~ '^/[^/].*' or route = '/'),
  primary_label     text not null check (char_length(primary_label) between 1 and 40),
  sent_at           timestamptz,
  provider_status   integer,
  last_error        text,
  remind_at         timestamptz,
  reminder_sent_at  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, subscription_id, category, local_date)
);

create index if not exists study_notification_events_reminders
  on public.study_notification_events (remind_at)
  where remind_at is not null and reminder_sent_at is null;

alter table public.study_notification_events enable row level security;
revoke all on public.study_notification_events from anon, authenticated;

create table if not exists public.notification_action_tokens (
  token_hash       text primary key check (char_length(token_hash) = 64),
  source_key       text not null unique,
  source_kind      text not null check (source_kind in ('buddy', 'study')),
  source_id        uuid not null,
  user_id          uuid not null references public.users(id) on delete cascade,
  subscription_id  uuid not null references public.push_subscriptions(id) on delete cascade,
  category         text,
  route            text not null check (route ~ '^/[^/].*' or route = '/'),
  allowed_actions  text[] not null,
  used_actions     text[] not null default '{}'::text[],
  expires_at       timestamptz not null default (now() + interval '8 days'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists notification_action_tokens_expiry
  on public.notification_action_tokens (expires_at);

alter table public.notification_action_tokens enable row level security;
revoke all on public.notification_action_tokens from anon, authenticated;

create or replace function public.perform_notification_action(
  p_action_token text,
  p_action text
)
returns table(ok boolean, action_result text, route text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  token_row public.notification_action_tokens%rowtype;
begin
  if char_length(coalesce(p_action_token, '')) < 32
     or char_length(coalesce(p_action, '')) = 0 then
    return query select false, 'invalid_action', '/'::text;
    return;
  end if;

  select token.*
    into token_row
  from public.notification_action_tokens token
  where token.token_hash = encode(digest(p_action_token, 'sha256'), 'hex')
  for update;

  if not found or token_row.expires_at <= now()
     or not (p_action = any(token_row.allowed_actions)) then
    return query select false, 'expired_or_invalid', '/'::text;
    return;
  end if;

  if p_action = any(token_row.used_actions) then
    return query select true, 'already_done', token_row.route;
    return;
  end if;

  if p_action = 'buddy_mark_read' and token_row.source_kind = 'buddy' then
    update public.buddy_messages message
    set read_at = coalesce(message.read_at, now())
    where message.id = token_row.source_id
      and message.sender_id <> token_row.user_id
      and public.is_buddy_active(message.buddy_id, token_row.user_id);
  elsif p_action = 'buddy_mute_1h' and token_row.source_kind = 'buddy' then
    update public.push_subscriptions subscription
    set push_quiet_until = now() + interval '1 hour',
        updated_at = now()
    where subscription.id = token_row.subscription_id
      and subscription.user_id = token_row.user_id;
  elsif p_action = 'study_remind_1h' and token_row.source_kind = 'study' then
    update public.study_notification_events event
    set remind_at = now() + interval '1 hour',
        reminder_sent_at = null,
        updated_at = now()
    where event.id = token_row.source_id
      and event.user_id = token_row.user_id;
  elsif p_action = 'study_mute' and token_row.source_kind = 'study' then
    update public.study_notification_preferences preference
    set enabled = false,
        updated_at = now()
    where preference.user_id = token_row.user_id
      and preference.category = token_row.category;
  else
    return query select false, 'invalid_action', token_row.route;
    return;
  end if;

  update public.notification_action_tokens token
  set used_actions = array_append(token.used_actions, p_action),
      updated_at = now()
  where token.token_hash = token_row.token_hash;

  return query
    select true,
      case p_action
        when 'buddy_mark_read' then 'marked_read'
        when 'buddy_mute_1h' then 'buddy_muted_1h'
        when 'study_remind_1h' then 'reminder_set_1h'
        when 'study_mute' then 'category_muted'
        else 'done'
      end,
      token_row.route;
end;
$$;

revoke all on function public.perform_notification_action(text, text) from public;
grant execute on function public.perform_notification_action(text, text) to service_role;

select cron.unschedule('notification-action-token-cleanup')
where exists (select 1 from cron.job where jobname = 'notification-action-token-cleanup');

select cron.schedule(
  'notification-action-token-cleanup',
  '41 3 * * *',
  $job$
    delete from public.notification_action_tokens
    where expires_at < now() - interval '1 day';
  $job$
);

select cron.unschedule('study-notifications')
where exists (select 1 from cron.job where jobname = 'study-notifications');

select cron.schedule(
  'study-notifications',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'air_journal_project_url'
      limit 1
    ) || '/functions/v1/study-notifications',
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
    timeout_milliseconds := 30000
  );
  $job$
);

comment on table public.study_notification_preferences is
  'Explicit per-module daily push preferences, gated by users.study_notifications_enabled.';
comment on table public.notification_action_tokens is
  'Private expiring bearer-token digests for Android/Web notification actions.';
