-- Unfriend: either member of a buddies pair can dissolve it.
--
-- Semantics vs. respond_buddy_request(decline):
--   decline  → status='paused', 24h cooldown before re-request. Used on a
--              pending request the recipient does not want to accept right
--              now but is not ready to reject permanently.
--   unfriend → hard delete of the buddies row. The FK cascade on
--              buddy_messages drops the chat history too. Either party can
--              send a fresh request immediately after (no cooldown), because
--              the paused-state cooldown logic never runs.
--
-- Any authenticated user can call this RPC as long as they are user_a or
-- user_b of the pair. The RPC is security-definer so the caller doesn't
-- need write access to the buddies table; RLS on buddies still applies for
-- SELECT.

set search_path = public, extensions;

create or replace function public.unfriend_buddy(b_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  bud public.buddies%rowtype;
  uid uuid;
begin
  uid := auth.uid();
  if uid is null then raise exception 'not signed in'; end if;

  select * into bud from public.buddies where id = b_id for update;
  if not found then raise exception 'buddy row not found'; end if;
  if bud.user_a <> uid and bud.user_b <> uid then
    raise exception 'not a member of this pair';
  end if;

  -- Cascade drops the buddy_messages rows via the FK on delete cascade.
  delete from public.buddies where id = b_id;
end $$;

comment on function public.unfriend_buddy(uuid) is
  'Hard-deletes a buddies pair the caller is a member of. Cascades to '
  'buddy_messages. Use this for permanent unfriending; use '
  'respond_buddy_request(decline) for the paused/cooldown flow instead.';

grant execute on function public.unfriend_buddy(uuid) to authenticated;
