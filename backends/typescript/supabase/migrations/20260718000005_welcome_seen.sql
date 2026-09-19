-- Per-account welcome-overlay flag. Previously stored in Dexie meta, but
-- `wipeLocalState()` clears Dexie on every sign-out, so the walkthrough
-- popped back on every login. Store it on the profile row instead so it's
-- shown once per account, ever.

set search_path = public, extensions;

alter table public.users
  add column if not exists welcome_seen_at timestamptz;
