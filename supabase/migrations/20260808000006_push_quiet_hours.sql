-- Push notification enhancements: quiet-hours / snooze support.
set search_path = public, extensions;
alter table public.push_subscriptions
  add column if not exists push_quiet_until timestamptz;
create index if not exists push_subscriptions_quiet_until
  on public.push_subscriptions (user_id, push_quiet_until)
  where push_quiet_until is not null;
create or replace function public.set_push_quiet_hours(
  p_device_id uuid,
  p_quiet_minutes integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  clamped integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if p_device_id is null then
    raise exception 'device id is required';
  end if;
  if p_quiet_minutes < 0 then
    raise exception 'quiet minutes cannot be negative';
  end if;
  clamped := least(p_quiet_minutes, 2880);
  update public.push_subscriptions
  set push_quiet_until = case
        when clamped = 0 then null
        else now() + (clamped || ' minutes')::interval
      end,
      updated_at = now()
  where user_id = auth.uid()
    and device_id = p_device_id;
  return found;
end;
$$;
revoke all on function public.set_push_quiet_hours(uuid, integer) from public;
grant execute on function public.set_push_quiet_hours(uuid, integer) to authenticated;
comment on column public.push_subscriptions.push_quiet_until is
  'When set, the edge function suppresses push delivery until this UTC timestamp.';
comment on function public.set_push_quiet_hours(uuid, integer) is
  'Set or clear a snooze window for one registered device. p_quiet_minutes=0 clears it.';
