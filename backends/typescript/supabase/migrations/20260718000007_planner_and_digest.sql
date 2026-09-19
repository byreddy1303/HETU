-- Custom planner + notification preferences + WhatsApp opt-in fields.
--
-- Planner model:
--   plan_items are user-defined tasks with a due_date, subject, notes, and a
--   done timestamp. Recurring tasks are represented by rrule_kind for the
--   common cases (daily / weekly weekday-list). One-off items just use
--   due_date. Item completion is per-day even for recurring items — completed
--   is tracked via plan_item_completions (item_id + on_date).
--
-- Notifications:
--   digest_email_enabled  : opt-in for daily email
--   digest_whatsapp_enabled : opt-in for daily WhatsApp
--   phone_e164            : +919xxx… format, required for WhatsApp
--   digest_hour_local     : integer 0-23, local hour in the user's timezone
--   wa_opted_in_at        : timestamp — set when Meta confirms opt-in

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. Notification preferences on users
-- ---------------------------------------------------------------------------

alter table public.users
  add column if not exists phone_e164 text,
  add column if not exists digest_email_enabled boolean not null default true,
  add column if not exists digest_whatsapp_enabled boolean not null default false,
  add column if not exists digest_hour_local smallint not null default 6
    check (digest_hour_local between 0 and 23),
  add column if not exists wa_opted_in_at timestamptz,
  add column if not exists last_digest_sent_on date;

alter table public.users
  add constraint users_phone_e164_shape
  check (phone_e164 is null or phone_e164 ~ '^\+[1-9]\d{7,14}$') not valid;

alter table public.users validate constraint users_phone_e164_shape;

-- ---------------------------------------------------------------------------
-- 2. plan_items — a task the user schedules for themselves
-- ---------------------------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_type where typname = 'plan_rrule_t') then
    create type plan_rrule_t as enum (
      'none',         -- one-off; due only on due_date
      'daily',        -- every day starting from due_date
      'weekdays',     -- every Mon-Fri
      'weekly'        -- every 7 days on the same weekday as due_date
    );
  end if;
end $$;

create table if not exists public.plan_items (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.users(id) on delete cascade,
  title         text not null check (char_length(trim(title)) between 1 and 140),
  subject       text,
  notes         text check (notes is null or char_length(notes) <= 800),
  due_date      date not null,
  rrule_kind    plan_rrule_t not null default 'none',
  ends_on       date,
  target_min    smallint check (target_min is null or target_min between 5 and 480),
  is_archived   boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists plan_items_by_user on public.plan_items (user_id, due_date);
create index if not exists plan_items_by_user_active
  on public.plan_items (user_id) where is_archived = false;

alter table public.plan_items enable row level security;

drop policy if exists sel_self on public.plan_items;
create policy sel_self on public.plan_items
  for select to authenticated using (user_id = auth.uid());

drop policy if exists ins_self on public.plan_items;
create policy ins_self on public.plan_items
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists upd_self on public.plan_items;
create policy upd_self on public.plan_items
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists del_self on public.plan_items;
create policy del_self on public.plan_items
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.plan_items to authenticated;

-- ---------------------------------------------------------------------------
-- 3. plan_item_completions — daily done markers
-- ---------------------------------------------------------------------------

create table if not exists public.plan_item_completions (
  item_id       uuid not null references public.plan_items(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  on_date       date not null,
  completed_at  timestamptz not null default now(),
  primary key (item_id, on_date)
);

create index if not exists plan_item_completions_by_user_date
  on public.plan_item_completions (user_id, on_date);

alter table public.plan_item_completions enable row level security;

drop policy if exists sel_self on public.plan_item_completions;
create policy sel_self on public.plan_item_completions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists ins_self on public.plan_item_completions;
create policy ins_self on public.plan_item_completions
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists del_self on public.plan_item_completions;
create policy del_self on public.plan_item_completions
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, delete on public.plan_item_completions to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Helper: items due on a given date for a user (expands rrule)
-- ---------------------------------------------------------------------------

create or replace function public.plan_items_due_on(uid uuid, on_date date)
returns setof public.plan_items
language sql stable security definer set search_path = public
as $$
  select *
  from public.plan_items p
  where p.user_id = uid
    and p.is_archived = false
    and (p.ends_on is null or on_date <= p.ends_on)
    and on_date >= p.due_date
    and case p.rrule_kind
          when 'none' then on_date = p.due_date
          when 'daily' then true
          when 'weekdays' then extract(isodow from on_date) between 1 and 5
          when 'weekly' then extract(isodow from on_date) = extract(isodow from p.due_date)
        end;
$$;

grant execute on function public.plan_items_due_on(uuid, date) to authenticated, service_role;
