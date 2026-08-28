-- The shipped GATE bank begins in 1990. Keep the synchronized attempt ledger
-- aligned with that lower bound so those questions can be practiced normally.
alter table public.pyq_attempts
  drop constraint if exists pyq_attempts_year_check,
  add constraint pyq_attempts_year_check check (year between 1990 and 2100);
