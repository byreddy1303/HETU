-- Evaluate the authenticated user once per statement instead of once per row.
-- These policies preserve the same exact-owner authorization boundary while
-- avoiding the auth RLS init-plan warning on the restored durable tables.

set search_path = public, extensions;

drop policy if exists sel_self on public.mock_tests;
create policy sel_self
on public.mock_tests
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists ins_self on public.mock_tests;
create policy ins_self
on public.mock_tests
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists upd_self on public.mock_tests;
create policy upd_self
on public.mock_tests
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists del_self on public.mock_tests;
create policy del_self
on public.mock_tests
for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists sel_self on public.topic_progress;
create policy sel_self
on public.topic_progress
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists ins_self on public.topic_progress;
create policy ins_self
on public.topic_progress
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists upd_self on public.topic_progress;
create policy upd_self
on public.topic_progress
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists del_self on public.topic_progress;
create policy del_self
on public.topic_progress
for delete
to authenticated
using ((select auth.uid()) = user_id);
