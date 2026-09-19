-- Add minute preference for daily digest delivery (0-59, default 0).

set search_path = public, extensions;

alter table public.users
  add column if not exists digest_minute_local smallint not null default 0
    check (digest_minute_local between 0 and 59);
