-- Explicitly lock down the helper RPCs to service_role only.
-- The previous `revoke all from public` was insufficient because Supabase's
-- default_privileges grant EXECUTE to anon + authenticated for public schema
-- functions on creation. This migration revokes from every role except
-- service_role.

set search_path = public, extensions;

revoke execute on function public.find_user_id_by_username(text) from anon, authenticated, public;
revoke execute on function public.send_buddy_request(uuid, uuid) from anon, authenticated, public;

grant execute on function public.find_user_id_by_username(text) to service_role;
grant execute on function public.send_buddy_request(uuid, uuid) to service_role;
