// 1:1 chat between paired buddies. Full-fledged realtime over Supabase's
// websocket channel:
//   - postgres_changes INSERT   → new messages appear live
//   - postgres_changes UPDATE   → read receipts propagate
//   - broadcast('typing')       → typing indicator, debounced
// App-wide Presence is maintained separately by BuddyPresenceRuntime so the
// online dot stays accurate even while the peer studies on another page.
//
// Message kinds:
//   text     — plain text bubble
//   question — shared-question card. The payload deliberately excludes the
//              sender's outcome, pattern, root cause, notes and any analysis.
//              Only the raw question (source, format, prompt, image, target
//              time). The recipient sees the question fresh, no bias.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check,
  CheckCheck,
  CloudOff,
  Image as ImageIcon,
  MoreVertical,
  RefreshCcw,
  Send,
  ArrowUp,
  UserX,
  X
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import type {
  BuddyMessageRow,
  QuestionRow,
  SharedQuestionRef,
  UserRow
} from '@/types';
import { formatDate } from '@/lib/utils';
import { subjectInk } from '@/lib/subjectInk';
import {
  buddyRealtimeTopic,
  isSharedQuestionRef,
  mergeBuddyMessages,
  safeQuestionRef
} from '@/lib/buddy';
import { useBuddyPresenceStore } from '@/stores/buddyPresence';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { notifyBuddyMessage, touchActiveBuddy } from '@/lib/buddyNotifications';

interface Props {
  buddyId: string;
  meId: string;
  peer: Pick<UserRow, 'id' | 'name' | 'email' | 'username'>;
  onUnfriend?: () => void;
}

const TEXT_LIMIT = 4000;
const MSG_PAGE_SIZE = 200;
const TYPING_INTERVAL_MS = 1500;
const TYPING_TIMEOUT_MS = 3500;

function displayName(peer: Props['peer']): string {
  const nm = (peer?.name || '').trim();
  if (nm) return nm;
  const un = (peer?.username || '').trim();
  if (un) return `@${un}`;
  return 'Buddy';
}

function firstName(peer: Props['peer']): string {
  const nm = (peer?.name || '').trim();
  if (nm) return nm.split(/\s+/)[0];
  const un = (peer?.username || '').trim();
  return un || 'buddy';
}

export default function BuddyChat({ buddyId, meId, peer, onUnfriend }: Props) {
  const [messages, setMessages] = useState<BuddyMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [picker, setPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const peerOnline = useBuddyPresenceStore(
    (state) => state.onlineUsersByBuddy[buddyId]?.includes(peer.id) ?? false
  );
  const [peerTyping, setPeerTyping] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmUnfriend, setConfirmUnfriend] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [connection, setConnection] = useState<'connecting' | 'live' | 'retrying' | 'offline'>('connecting');
  const listRef = useRef<HTMLDivElement>(null);
  const initialLoad = useRef(true);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastSentTypingAt = useRef(0);
  const peerTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!menuOpen && !confirmUnfriend) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (confirmUnfriend) setConfirmUnfriend(false);
      else setMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmUnfriend, menuOpen]);

  // Initial fetch + realtime subscribe.
  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    setLoading(true);
    setError(null);
    setPeerTyping(false);
    setConnection('connecting');
    setMenuOpen(false);
    setConfirmUnfriend(false);
    initialLoad.current = true;

    async function load() {
      const { data, error } = await supabase
        .from('buddy_messages')
        .select('*')
        .eq('buddy_id', buddyId)
        .order('created_at', { ascending: false })
        .limit(MSG_PAGE_SIZE);
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      setError(null);
      // Merge instead of replacing. An INSERT can arrive while this request is
      // in flight; replacing here would erase that just-rendered message.
      const fetched = [...((data as BuddyMessageRow[]) ?? [])].reverse();
      setMessages((current) => mergeBuddyMessages(current, fetched));
      setLoading(false);
    }
    void load();

    const channel: RealtimeChannel = supabase.channel(buddyRealtimeTopic(buddyId));

    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'buddy_messages',
          filter: `buddy_id=eq.${buddyId}`
        },
        (payload) => {
          const row = payload.new as BuddyMessageRow;
          setMessages((prev) => mergeBuddyMessages(prev, [row]));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'buddy_messages',
          filter: `buddy_id=eq.${buddyId}`
        },
        (payload) => {
          const row = payload.new as BuddyMessageRow;
          setMessages((prev) =>
            prev.map((m) => (m.id === row.id ? { ...m, ...row } : m))
          );
        }
      )
      .on('broadcast', { event: 'typing' }, (payload) => {
        const p = payload.payload as { from?: string } | undefined;
        if (!p?.from || p.from === meId) return;
        setPeerTyping(true);
        if (peerTypingTimer.current) clearTimeout(peerTypingTimer.current);
        peerTypingTimer.current = setTimeout(
          () => setPeerTyping(false),
          TYPING_TIMEOUT_MS
        );
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnection('live');
          // Close the fetch-before-subscribe gap: reconcile once the database
          // change feed is definitely live.
          void load();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnection('retrying');
        } else if (status === 'CLOSED') {
          setConnection('offline');
        }
      });

    channelRef.current = channel;

    const resyncWhenVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', resyncWhenVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', resyncWhenVisible);
      if (peerTypingTimer.current) clearTimeout(peerTypingTimer.current);
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [buddyId, meId, retryKey]);

  // Mark peer's unread messages as read whenever new ones arrive and we're
  // looking at the chat. Read receipts propagate via the UPDATE subscription.
  const markRead = useCallback(async () => {
    const unreadIds = messages
      .filter((m) => m.sender_id !== meId && m.read_at === null)
      .map((m) => m.id);
    if (unreadIds.length === 0) return;
    const now = new Date().toISOString();
    setMessages((prev) =>
      prev.map((m) => (unreadIds.includes(m.id) ? { ...m, read_at: now } : m))
    );
    const { error } = await supabase
      .from('buddy_messages')
      .update({ read_at: now })
      .eq('buddy_id', buddyId)
      .neq('sender_id', meId)
      .in('id', unreadIds);
    if (error) {
      // Roll back the optimistic read-flag so the next attempt tries again.
      setMessages((prev) =>
        prev.map((m) => (unreadIds.includes(m.id) ? { ...m, read_at: null } : m))
      );
    }
  }, [messages, meId, buddyId]);

  useEffect(() => {
    if (!loading) void markRead();
  }, [loading, markRead]);

  // Suppress an OS alert only on the device that is actively viewing this
  // exact chat. Other registered devices continue to receive the message.
  useEffect(() => {
    const heartbeat = () => {
      if (document.visibilityState === 'visible') {
        void touchActiveBuddy(buddyId).catch(() => undefined);
      }
    };
    heartbeat();
    const timer = window.setInterval(heartbeat, 30_000);
    document.addEventListener('visibilitychange', heartbeat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', heartbeat);
      void touchActiveBuddy(null).catch(() => undefined);
    };
  }, [buddyId]);

  // Auto-scroll to bottom on new messages / initial load.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (initialLoad.current || nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
    if (!loading && messages.length > 0) initialLoad.current = false;
  }, [messages, loading]);

  function broadcastTyping() {
    const ch = channelRef.current;
    if (!ch) return;
    const now = Date.now();
    if (now - lastSentTypingAt.current < TYPING_INTERVAL_MS) return;
    lastSentTypingAt.current = now;
    void ch.send({ type: 'broadcast', event: 'typing', payload: { from: meId } });
  }

  async function sendText() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    const optimistic: BuddyMessageRow = {
      id: crypto.randomUUID(),
      buddy_id: buddyId,
      sender_id: meId,
      kind: 'text',
      body,
      question_ref: null,
      created_at: new Date().toISOString(),
      read_at: null
    };
    setMessages((m) => mergeBuddyMessages(m, [optimistic]));
    setDraft('');
    const { error } = await supabase.from('buddy_messages').insert({
      id: optimistic.id,
      buddy_id: buddyId,
      sender_id: meId,
      kind: 'text',
      body
    });
    setSending(false);
    if (error) {
      setMessages((m) => m.filter((row) => row.id !== optimistic.id));
      setDraft(body);
      setError(error.message);
    } else {
      setError(null);
      notifyBuddyMessage(optimistic.id);
    }
  }

  async function shareQuestion(q: QuestionRow) {
    setPicker(false);
    setSending(true);
    const ref = safeQuestionRef(q);
    const optimistic: BuddyMessageRow = {
      id: crypto.randomUUID(),
      buddy_id: buddyId,
      sender_id: meId,
      kind: 'question',
      body: null,
      question_ref: ref,
      created_at: new Date().toISOString(),
      read_at: null
    };
    setMessages((m) => mergeBuddyMessages(m, [optimistic]));
    const { error } = await supabase.from('buddy_messages').insert({
      id: optimistic.id,
      buddy_id: buddyId,
      sender_id: meId,
      kind: 'question',
      question_ref: ref
    });
    setSending(false);
    if (error) {
      setMessages((m) => m.filter((row) => row.id !== optimistic.id));
      setError(error.message);
    } else {
      setError(null);
      notifyBuddyMessage(optimistic.id);
    }
  }

  const grouped = useMemo(() => groupByDay(messages), [messages]);
  const nameToShow = displayName(peer);

  return (
    <div className="native-buddy-chat flex h-full min-h-[420px] flex-col overflow-hidden rounded-lg border border-border bg-bg-raised">
      <header className="native-chat-header relative flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="relative">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-cobalt/15 font-display text-[13px] font-bold text-ink-cobalt">
            {(nameToShow.replace(/^@/, '') || '?')[0].toUpperCase()}
          </span>
          <span
            className={cn(
              'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-bg-raised',
              peerOnline ? 'bg-success' : 'bg-border'
            )}
            aria-label={peerOnline ? 'Online' : 'Offline'}
            title={peerOnline ? 'Online' : 'Offline'}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-text">{nameToShow}</p>
          <p className="u-num truncate text-[11px] text-text-faint">
            {peerTyping
              ? 'typing…'
              : connection !== 'live'
                ? connection === 'connecting'
                  ? 'connecting…'
                  : connection === 'retrying'
                    ? 'reconnecting…'
                    : 'offline'
                : peer.username
                  ? `@${peer.username}`
                  : peer.email || ''}
          </p>
        </div>
        {onUnfriend && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Chat options"
              className="rounded-full p-1.5 text-text-faint transition-colors hover:bg-bg-overlay hover:text-text"
            >
              <MoreVertical size={16} strokeWidth={1.75} />
            </button>
            {menuOpen && (
              <>
                <button
                  type="button"
                  aria-hidden
                  tabIndex={-1}
                  onClick={() => setMenuOpen(false)}
                  className="fixed inset-0 z-10 cursor-default"
                />
                <div
                  className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-lg border border-border bg-bg-raised shadow-lift"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Chat options"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmUnfriend(true);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-danger transition-colors hover:bg-danger-faint"
                  >
                    <UserX size={13} strokeWidth={1.75} />
                    Unfriend
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </header>

      {confirmUnfriend && (
        <div
          className="flex flex-wrap items-center gap-3 border-b border-border/60 bg-danger-faint/60 px-4 py-3 text-[12.5px] text-text"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm unfriend"
        >
          <span className="flex-1">
            Unfriend <span className="font-semibold">{nameToShow}</span>? This
            deletes the pair and all messages on both sides. No cooldown — you
            can send a fresh request afterwards.
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmUnfriend(false)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              setConfirmUnfriend(false);
              onUnfriend?.();
            }}
          >
            <UserX size={12} strokeWidth={1.75} className="mr-1" />
            Confirm unfriend
          </Button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2 text-[12px] text-warn">
          <CloudOff size={13} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">{error}</span>
          <button
            type="button"
            onClick={() => setRetryKey((key) => key + 1)}
            className="inline-flex items-center gap-1 font-semibold hover:text-text"
          >
            <RefreshCcw size={11} /> Try again
          </button>
        </div>
      )}

      <div
        ref={listRef}
        className="native-chat-messages relative flex-1 overflow-y-auto bg-bg px-3 py-4 sm:px-4"
      >
        {loading ? (
          <p className="mt-6 text-center text-[12px] text-text-faint">Loading…</p>
        ) : messages.length === 0 ? (
          <div className="mt-10 flex flex-col items-center gap-2 text-center">
            <p className="font-display text-[15px] font-semibold text-text">
              Start the conversation.
            </p>
            <p className="max-w-[280px] text-[12.5px] leading-relaxed text-text-muted">
              Ask a doubt. Share a question you're stuck on. Nothing about your
              tags or performance ever crosses over — only the question itself.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.length === MSG_PAGE_SIZE && (
              <li className="mx-auto rounded-full border border-border bg-bg-raised px-3 py-0.5 text-[10.5px] text-text-faint">
                Showing the latest {MSG_PAGE_SIZE} messages
              </li>
            )}
            {grouped.map((chunk) => (
              <li key={chunk.day} className="flex flex-col gap-2">
                <div className="mx-auto rounded-full border border-border bg-bg-raised px-3 py-0.5 text-[10.5px] uppercase tracking-wider text-text-faint">
                  {formatDate(chunk.day, 'EEE, dd MMM')}
                </div>
                {chunk.rows.map((m) => (
                  <MessageBubble
                    key={m.id}
                    msg={m}
                    isMe={m.sender_id === meId}
                  />
                ))}
              </li>
            ))}
          </ul>
        )}
        {peerTyping && !loading && (
          <div className="mt-3 flex items-center gap-2 text-[11.5px] text-text-faint">
            <TypingDots /> {firstName(peer)} is typing…
          </div>
        )}
      </div>

      <div className="native-chat-composer border-t border-border px-3 py-3">
        <div className="native-chat-share-note mb-2 flex flex-wrap items-center gap-2 text-[11.5px] text-text-muted">
          <button
            type="button"
            onClick={() => setPicker(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-raised px-3 py-1 font-medium text-text-muted transition-colors hover:-translate-y-px hover:border-border-hover hover:text-text"
          >
            <ImageIcon size={12} strokeWidth={1.75} /> Share a question
          </button>
          <span className="text-[11px] text-text-faint">
            No outcome, pattern, or tags cross over.
          </span>
        </div>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => setPicker(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-border bg-bg-raised text-text-muted transition-all hover:-translate-y-px hover:border-border-hover hover:text-text hover:shadow-card active:translate-y-0"
            title="Share a question"
          >
            <ImageIcon size={16} strokeWidth={1.75} />
          </button>
          <div className="flex-1">
            <textarea
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value.slice(0, TEXT_LIMIT));
                if (e.target.value.length > 0) broadcastTyping();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendText();
                }
              }}
              placeholder={`Message ${firstName(peer)}…`}
              rows={1}
              className="native-chat-input block max-h-32 min-h-[40px] w-full resize-none rounded border border-border bg-bg-raised px-3 py-2 text-[13.5px] leading-snug text-text placeholder:text-text-faint focus:border-accent focus:shadow-[0_0_0_3px_theme(colors.accent.faint)] focus:outline-none"
            />
            <div className="native-chat-meta mt-1 flex items-center justify-between text-[10.5px] text-text-faint">
              <span className="native-keyboard-hint">Enter to send · Shift+Enter for newline</span>
              <span className="u-num">
                {draft.length}/{TEXT_LIMIT}
              </span>
            </div>
          </div>
          <Button
            type="button"
            variant="primary"
            onClick={() => void sendText()}
            disabled={sending || draft.trim().length === 0}
            className="h-10 w-10 shrink-0 !p-0"
            title="Send"
          >
            <Send size={16} strokeWidth={2} />
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {picker && (
          <QuestionPicker
            meId={meId}
            onPick={(q) => void shareQuestion(q)}
            onClose={() => setPicker(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function MessageBubble({ msg, isMe }: { msg: BuddyMessageRow; isMe: boolean }) {
  const time = new Date(msg.created_at).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit'
  });
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={cn('flex', isMe ? 'justify-end' : 'justify-start')}
    >
      <div className={cn('max-w-[80%]', isMe ? 'items-end' : 'items-start')}>
        {msg.kind === 'question' && isSharedQuestionRef(msg.question_ref) ? (
          <QuestionCard ref_={msg.question_ref} isMe={isMe} />
        ) : msg.kind === 'question' ? (
          <div className="rounded-2xl border border-warn/30 bg-warn-faint px-3 py-2 text-[12px] text-text-muted">
            Shared question unavailable.
          </div>
        ) : (
          <div
            className={cn(
              'rounded-2xl px-3 py-2 text-[13.5px] leading-relaxed shadow-sm',
              isMe
                ? 'bg-accent text-accent-contrast rounded-br-md'
                : 'bg-bg-raised text-text border border-border rounded-bl-md'
            )}
          >
            <p className="whitespace-pre-wrap break-words">{msg.body}</p>
          </div>
        )}
        <p
          className={cn(
            'mt-1 flex items-center gap-1 px-1 text-[10.5px] tabular-nums text-text-faint',
            isMe ? 'justify-end' : 'justify-start'
          )}
        >
          <span>{time}</span>
          {isMe && (
            msg.read_at ? (
              <CheckCheck size={11} strokeWidth={2} className="text-accent" aria-label="Read" />
            ) : (
              <Check size={11} strokeWidth={2} aria-label="Sent" />
            )
          )}
        </p>
      </div>
    </motion.div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      <span className="h-1 w-1 animate-bounce rounded-full bg-text-faint [animation-delay:-0.3s]" />
      <span className="h-1 w-1 animate-bounce rounded-full bg-text-faint [animation-delay:-0.15s]" />
      <span className="h-1 w-1 animate-bounce rounded-full bg-text-faint" />
    </span>
  );
}

function QuestionCard({ ref_, isMe }: { ref_: SharedQuestionRef; isMe: boolean }) {
  const ink = subjectInk(ref_.subject);
  const sourceLine = ref_.source_ref
    ? `${ref_.source_ref}${ref_.source_year ? ` · ${ref_.source_year}` : ''}`
    : ref_.source_year
      ? `${ref_.source_year}`
      : null;
  const targetMin = Math.round(ref_.target_time_sec / 60);
  return (
    <div
      className={cn(
        'w-full overflow-hidden rounded-2xl border shadow-sm',
        isMe ? 'bg-accent/15 border-accent/40 rounded-br-md' : 'bg-bg-raised border-border rounded-bl-md'
      )}
    >
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-text-muted">
          <span className={cn('h-1.5 w-1.5 rounded-full', ink.dot)} />
          {ref_.subject}
          {ref_.subtopic ? <span className="text-text-faint"> · {ref_.subtopic}</span> : null}
        </span>
        <span className="u-num text-[10.5px] text-text-faint">
          {targetMin}m target
        </span>
      </div>
      {ref_.image_url && (
        <img
          src={ref_.image_url}
          alt="Shared question"
          className="max-h-72 w-full object-contain bg-bg"
        />
      )}
      <div className="space-y-1 px-3 py-2 text-[13px] leading-relaxed text-text">
        {ref_.question_text ? (
          <p className="whitespace-pre-wrap">{ref_.question_text}</p>
        ) : ref_.image_url ? (
          <p className="text-[12px] italic text-text-muted">See image.</p>
        ) : (
          <p className="text-[12px] italic text-text-muted">No text.</p>
        )}
        {sourceLine && (
          <p className="text-[10.5px] uppercase tracking-wider text-text-faint">
            {sourceLine}
          </p>
        )}
      </div>
    </div>
  );
}

function QuestionPicker({
  meId,
  onPick,
  onClose
}: {
  meId: string;
  onPick: (q: QuestionRow) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<QuestionRow[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const all = await db.questions.where('user_id').equals(meId).toArray();
      if (cancelled) return;
      setRows(
        all
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 400)
      );
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [meId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.subject, r.subtopic, r.question_text, r.source_ref]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle))
    );
  }, [q, rows]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="native-question-picker-overlay absolute inset-0 z-30 flex items-center justify-center bg-black/25 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6, scale: 0.98 }}
        transition={{ duration: 0.22 }}
        onClick={(e) => e.stopPropagation()}
        className="native-question-picker-panel mx-3 flex max-h-[70vh] w-full max-w-[520px] flex-col overflow-hidden rounded-lg border border-border bg-bg-raised shadow-card"
        role="dialog"
        aria-modal="true"
        aria-label="Share a question"
      >
        <header className="native-question-picker-header flex items-center gap-2 border-b border-border px-4 py-3">
          <p className="font-display text-[14px] font-semibold text-text">
            Share a question
          </p>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded p-1 text-text-faint hover:text-text"
            aria-label="Close"
          >
            <X size={14} strokeWidth={1.75} />
          </button>
        </header>
        <div className="native-question-picker-search border-b border-border px-4 py-2">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by subject, topic, source, text…"
            autoFocus
            className="native-question-picker-input block w-full rounded border border-border bg-bg px-3 py-1.5 text-[13px] text-text placeholder:text-text-faint focus:border-accent focus:shadow-[0_0_0_3px_theme(colors.accent.faint)] focus:outline-none"
          />
          <p className="mt-1 text-[10.5px] text-text-faint">
            Only the question is shared. Your outcome, pattern, and root cause
            never leave your journal.
          </p>
        </div>
        <div className="native-question-picker-list flex-1 overflow-y-auto">
          {loading ? (
            <p className="p-4 text-[12px] text-text-faint">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-[12px] text-text-faint">
              {rows.length === 0
                ? "You haven't logged any questions yet."
                : 'No matches. Try a different filter.'}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.slice(0, 50).map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onPick(r)}
                    className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-bg-overlay"
                  >
                    <span
                      className={cn(
                        'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                        subjectInk(r.subject).dot
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium text-text">
                        {r.subject}
                        {r.subtopic ? (
                          <span className="text-text-faint"> · {r.subtopic}</span>
                        ) : null}
                      </p>
                      <p className="line-clamp-2 text-[12px] text-text-muted">
                        {r.question_text ??
                          (r.image_url ? '(image question)' : '(no text)')}
                      </p>
                      <p className="mt-0.5 text-[10.5px] text-text-faint">
                        {r.source_ref ?? 'no source'}{' '}
                        {r.source_year ? `· ${r.source_year}` : ''} ·{' '}
                        {formatDate(r.created_at.slice(0, 10), 'dd MMM')}
                      </p>
                    </div>
                    <ArrowUp
                      size={12}
                      strokeWidth={1.75}
                      className="rotate-45 text-text-faint"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function groupByDay(rows: BuddyMessageRow[]): { day: string; rows: BuddyMessageRow[] }[] {
  const out: { day: string; rows: BuddyMessageRow[] }[] = [];
  for (const r of rows) {
    const day = r.created_at.slice(0, 10);
    const last = out.at(-1);
    if (last && last.day === day) last.rows.push(r);
    else out.push({ day, rows: [r] });
  }
  return out;
}
