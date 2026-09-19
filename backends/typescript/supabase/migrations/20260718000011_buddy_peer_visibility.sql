-- Buddy peer visibility.
--
-- users.sel_self restricts SELECT to `id = auth.uid()` — good for privacy,
-- but it also hides the OTHER party's row from a pending / paused / active
-- buddies pair, so the receiver's UI can't render "@sender wants to pair"
-- (peer resolves to null and the row is filtered out).
--
-- Rather than loosen the base-table RLS (which would leak digest prefs,
-- phone, timezone, etc.), expose a narrow security-definer RPC that returns
-- just id, name, username, email for peers the caller is linked to.

set search_path = public, extensions;

create or replace function public.list_buddy_peers()
returns table (id uuid, name text, email text, username text)
language sql stable security definer set search_path = public
as $$
  select u.id, u.name, u.email, u.username
  from public.users u
  where u.id <> auth.uid()
    and exists (
      select 1 from public.buddies b
      where (b.user_a = auth.uid() and b.user_b = u.id)
         or (b.user_b = auth.uid() and b.user_a = u.id)
    );
$$;

revoke execute on function public.list_buddy_peers() from public;
grant execute on function public.list_buddy_peers() to authenticated;
