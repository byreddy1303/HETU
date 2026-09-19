-- Make every practice workflow explicit while retaining one canonical session
-- stream for dashboard targets, history and journal grouping.
alter table public.sessions
  add column if not exists kind text not null default 'focused'
  check (kind in ('focused', 'log', 'pyq'));

-- Zero-target rows were the historical marker for untimed log batches.
update public.sessions
set kind = 'log'
where target_duration_min = 0
  and kind = 'focused';
