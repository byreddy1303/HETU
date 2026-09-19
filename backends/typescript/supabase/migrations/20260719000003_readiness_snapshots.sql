-- Readiness snapshots + peer-anonymous median.
--
-- Each user upserts one readiness score per day into public.readiness_snapshots
-- (via the writeSnapshot() client on /readiness open). The peer-median RPC
-- reads all snapshots in a T− (days-to-exam) band around the caller's own
-- days_to_exam and returns just the median score + sample size. Individual
-- rows are never exposed to other users; RLS restricts SELECT to self.
--
-- Anti-cohort-of-one guard: the RPC returns null when the sample size is
-- below MIN_SAMPLE (default 3) so a single peer's score can't leak.

set search_path = public, extensions;

create table if not exists public.readiness_snapshots (
  user_id       uuid not null references public.users(id) on delete cascade,
  on_date       date not null default current_date,
  score         int  not null check (score between 0 and 100),
  days_to_exam  int  not null,
  created_at    timestamptz not null default now(),
  primary key (user_id, on_date)
);

create index if not exists readiness_snapshots_by_band
  on public.readiness_snapshots (days_to_exam, on_date desc);

alter table public.readiness_snapshots enable row level security;

drop policy if exists sel_self on public.readiness_snapshots;
create policy sel_self on public.readiness_snapshots
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists ins_self on public.readiness_snapshots;
create policy ins_self on public.readiness_snapshots
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists upd_self on public.readiness_snapshots;
create policy upd_self on public.readiness_snapshots
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on public.readiness_snapshots to authenticated;

-- ---------------------------------------------------------------------------
-- Peer-anonymous median RPC.
--   band_width_days: the ±window around caller.days_to_exam to search.
--   Returns median (0..100) + sample_size. If sample_size < 3, median is null
--   so a single peer's number never leaks.
-- ---------------------------------------------------------------------------

create or replace function public.readiness_median_for_band(
  band_width_days int default 7
)
returns table (median numeric, sample_size int)
language plpgsql
stable security definer set search_path = public
as $$
declare
  caller_days_to_exam int;
  min_sample constant int := 3;
begin
  -- Caller's most recent snapshot defines their band centre.
  select days_to_exam into caller_days_to_exam
    from public.readiness_snapshots
    where user_id = auth.uid()
    order by on_date desc
    limit 1;

  if caller_days_to_exam is null then
    return query select null::numeric, 0::int;
    return;
  end if;

  return query
    with peers as (
      select distinct on (user_id) user_id, score
        from public.readiness_snapshots
        where user_id <> auth.uid()
          and days_to_exam between caller_days_to_exam - band_width_days
                              and caller_days_to_exam + band_width_days
        order by user_id, on_date desc
    ),
    stats as (
      select
        percentile_cont(0.5) within group (order by score)::numeric as med,
        count(*)::int as n
      from peers
    )
    select
      case when n >= min_sample then med else null end,
      n
    from stats;
end $$;

grant execute on function public.readiness_median_for_band(int) to authenticated;

comment on function public.readiness_median_for_band(int) is
  'Peer-anonymous median readiness score within ±band_width_days of the '
  'caller''s most recent days_to_exam. Returns null median when the '
  'per-band peer sample size is under 3 to prevent identification.';
