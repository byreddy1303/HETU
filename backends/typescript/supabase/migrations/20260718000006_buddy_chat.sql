-- Buddy chat (1:1 between paired users).
-- kind='text'       : normal message. body carries the text.
-- kind='question'   : a shared question. question_ref carries a stripped
--                     snapshot of the question WITHOUT the sender's outcome,
--                     pattern, root cause, notes, or any analysis — only
--                     source, format, prompt, image, target time.
--                     Enforced at the client edge; DB accepts the payload.
--
-- Realtime: enabled on this table so live updates work without polling.

set search_path = public, extensions;

create table if not exists public.buddy_messages (
  id            uuid primary key default uuid_generate_v4(),
  buddy_id      uuid not null references public.buddies(id) on delete cascade,
  sender_id     uuid not null references public.users(id) on delete cascade,
  kind          text not null check (kind in ('text', 'question')),
  body          text check (body is null or char_length(body) <= 4000),
  question_ref  jsonb,
  created_at    timestamptz not null default now(),
  read_at       timestamptz,
  constraint chk_content check (
    (kind = 'text'     and body is not null and char_length(trim(body)) > 0) or
    (kind = 'question' and question_ref is not null)
  )
);

comment on table public.buddy_messages is
  '1:1 messages between paired buddies. question_ref must exclude any
   sender analysis (outcome, pattern, notes, root cause).';

create index if not exists buddy_messages_by_thread
  on public.buddy_messages (buddy_id, created_at desc);

alter table public.buddy_messages enable row level security;

-- Only members of the buddy pair can read/write.
create or replace function public.is_buddy_member(bid uuid, uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.buddies b
    where b.id = bid and (b.user_a = uid or b.user_b = uid)
  );
$$;

grant execute on function public.is_buddy_member(uuid, uuid) to authenticated;

drop policy if exists sel_member on public.buddy_messages;
create policy sel_member on public.buddy_messages
  for select to authenticated
  using (public.is_buddy_member(buddy_id));

drop policy if exists ins_member on public.buddy_messages;
create policy ins_member on public.buddy_messages
  for insert to authenticated
  with check (
    public.is_buddy_member(buddy_id) and sender_id = auth.uid()
  );

drop policy if exists upd_member on public.buddy_messages;
create policy upd_member on public.buddy_messages
  for update to authenticated
  using (public.is_buddy_member(buddy_id))
  with check (public.is_buddy_member(buddy_id));

grant select, insert, update on public.buddy_messages to authenticated;

-- Realtime
alter publication supabase_realtime add table public.buddy_messages;
