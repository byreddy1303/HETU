-- Buddy hardening: immutable messages, recipient-only read receipts, safe
-- question snapshots, and requester-owned cancellation.

set search_path = public, extensions;

create or replace function public.guard_buddy_message_write()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if tg_op = 'INSERT' then
    if new.read_at is not null then
      raise exception 'new messages must start unread';
    end if;
    if new.kind = 'text' and new.question_ref is not null then
      raise exception 'text messages cannot include a question snapshot';
    end if;
    if new.kind = 'question' then
      if new.body is not null then
        raise exception 'question messages cannot include a text body';
      end if;
      if jsonb_typeof(new.question_ref) <> 'object' then
        raise exception 'question snapshot must be an object';
      end if;
      if exists (
        select 1
        from jsonb_object_keys(new.question_ref) as allowed(key)
        where allowed.key not in (
          'subject',
          'subtopic',
          'question_text',
          'image_url',
          'source_ref',
          'source_year',
          'target_time_sec',
          'origin_question_id'
        )
      ) then
        raise exception 'question snapshot contains private or unsupported fields';
      end if;
    end if;
    return new;
  end if;

  -- System/service operations may maintain rows. Signed-in users may only
  -- change an incoming message from unread to read; content is immutable.
  if auth.uid() is null or auth.role() = 'service_role' then
    return new;
  end if;
  if old.sender_id = auth.uid() then
    raise exception 'senders cannot edit their messages or receipts';
  end if;
  if new.id is distinct from old.id
     or new.buddy_id is distinct from old.buddy_id
     or new.sender_id is distinct from old.sender_id
     or new.kind is distinct from old.kind
     or new.body is distinct from old.body
     or new.question_ref is distinct from old.question_ref
     or new.created_at is distinct from old.created_at then
    raise exception 'buddy message content is immutable';
  end if;
  if old.read_at is not null or new.read_at is null then
    raise exception 'only an unread incoming message may be marked read';
  end if;
  return new;
end;
$$;

drop trigger if exists buddy_message_write_guard on public.buddy_messages;
create trigger buddy_message_write_guard
before insert or update on public.buddy_messages
for each row execute function public.guard_buddy_message_write();

drop policy if exists upd_member on public.buddy_messages;
create policy upd_member on public.buddy_messages
  for update to authenticated
  using (
    public.is_buddy_active(buddy_id)
    and sender_id <> auth.uid()
    and read_at is null
  )
  with check (
    public.is_buddy_active(buddy_id)
    and sender_id <> auth.uid()
    and read_at is not null
  );

create or replace function public.cancel_buddy_request(b_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  bud public.buddies%rowtype;
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;

  select * into bud from public.buddies where id = b_id for update;
  if not found then raise exception 'buddy request not found'; end if;
  if bud.status <> 'pending' then raise exception 'request is no longer pending'; end if;
  if bud.requested_by is distinct from uid then
    raise exception 'only the requester can cancel this request';
  end if;

  delete from public.buddies where id = b_id;
end;
$$;

revoke all on function public.cancel_buddy_request(uuid) from public, anon;
grant execute on function public.cancel_buddy_request(uuid) to authenticated;
