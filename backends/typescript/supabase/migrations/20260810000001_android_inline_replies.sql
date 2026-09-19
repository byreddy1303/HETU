-- Secure, one-notification/one-token inline replies for native Buddy alerts.
-- The bearer token is delivered only inside the encrypted FCM payload. The
-- database stores its SHA-256 digest and atomically turns the first reply into
-- a normal buddy_messages row, so RLS-bypassing service code never has to
-- trust a buddy id supplied by the Android device.

set search_path = public, extensions;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.buddy_notification_reply_tokens (
  token_hash         text primary key check (char_length(token_hash) = 64),
  source_message_id  uuid not null references public.buddy_messages(id) on delete cascade,
  subscription_id    uuid not null references public.push_subscriptions(id) on delete cascade,
  reply_sender_id    uuid not null references public.users(id) on delete cascade,
  buddy_id           uuid not null references public.buddies(id) on delete cascade,
  expires_at         timestamptz not null default (now() + interval '7 days'),
  used_at            timestamptz,
  reply_message_id   uuid references public.buddy_messages(id) on delete set null,
  reply_body         text check (reply_body is null or char_length(reply_body) <= 4000),
  created_at         timestamptz not null default now(),
  unique (source_message_id, subscription_id)
);

create index if not exists buddy_notification_reply_tokens_expiry
  on public.buddy_notification_reply_tokens (expires_at)
  where used_at is null;

alter table public.buddy_notification_reply_tokens enable row level security;
revoke all on public.buddy_notification_reply_tokens from anon, authenticated;

create or replace function public.send_buddy_notification_reply(
  p_reply_token text,
  p_body text
)
returns table(message_id uuid, was_created boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  token_row public.buddy_notification_reply_tokens%rowtype;
  clean_body text := btrim(coalesce(p_body, ''));
  new_message_id uuid;
begin
  if char_length(coalesce(p_reply_token, '')) < 32
     or char_length(clean_body) = 0
     or char_length(clean_body) > 4000 then
    return;
  end if;

  select token.*
    into token_row
  from public.buddy_notification_reply_tokens token
  where token.token_hash = encode(digest(p_reply_token, 'sha256'), 'hex')
  for update;

  if not found or token_row.expires_at <= now() then
    return;
  end if;

  -- Network retries are idempotent when Android resends the same reply.
  if token_row.used_at is not null then
    if token_row.reply_body = clean_body and token_row.reply_message_id is not null then
      return query select token_row.reply_message_id, false;
    end if;
    return;
  end if;

  perform 1
  from public.buddies buddy
  where buddy.id = token_row.buddy_id
    and buddy.status = 'active'
    and token_row.reply_sender_id in (buddy.user_a, buddy.user_b);
  if not found then
    return;
  end if;

  new_message_id := gen_random_uuid();
  insert into public.buddy_messages (id, buddy_id, sender_id, kind, body)
  values (
    new_message_id,
    token_row.buddy_id,
    token_row.reply_sender_id,
    'text',
    clean_body
  );

  update public.buddy_notification_reply_tokens
  set used_at = now(),
      reply_message_id = new_message_id,
      reply_body = clean_body
  where token_hash = token_row.token_hash;

  return query select new_message_id, true;
end;
$$;

revoke all on function public.send_buddy_notification_reply(text, text) from public;
grant execute on function public.send_buddy_notification_reply(text, text) to service_role;

-- Tokens have no value after expiry/use; keep the private table bounded.
select cron.unschedule('buddy-reply-token-cleanup')
where exists (select 1 from cron.job where jobname = 'buddy-reply-token-cleanup');

select cron.schedule(
  'buddy-reply-token-cleanup',
  '23 3 * * *',
  $job$
    delete from public.buddy_notification_reply_tokens
    where expires_at < now() - interval '1 day'
       or used_at < now() - interval '7 days';
  $job$
);

comment on table public.buddy_notification_reply_tokens is
  'Private, expiring bearer-token digests used for Android direct replies.';
