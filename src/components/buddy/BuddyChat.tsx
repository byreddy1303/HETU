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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Check,
  CheckCheck,
  CloudOff,
  MoreVertical,
  RefreshCcw,
  UserX,
  X
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import type { BuddyMessageRow, QuestionRow, SharedQuestionRef, UserRow } from '@/types';
import { formatDate } from '@/lib/utils';
import { subjectInk } from '@/lib/subjectInk';
import {
  buddyRealtimeTopic,
  groupBuddyMessages,
  isSharedQuestionRef,
  mergeBuddyMessages,
  safeQuestionRef
} from '@/lib/buddy';
import { useBuddyPresenceStore } from '@/stores/buddyPresence';
import { BuddyAvatar } from '@/components/buddy/BuddyAvatar';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { cn } from '@/lib/utils';
import { notifyBuddyMessage, touchActiveBuddy } from '@/lib/buddyNotifications';
import { useMediaQuery } from '@/hooks/useMediaQuery';

interface Props {
  buddyId: string;
  meId: string;
  peer: Pick<UserRow, 'id' | 'name' | 'email' | 'username'>;
  onUnfriend?: () => void;
  onBack?: () => void;
  isVisible: boolean;
}

const TEXT_LIMIT = 4000;
const MSG_PAGE_SIZE = 50;
const TYPING_INTERVAL_MS = 1500;
const TYPING_TIMEOUT_MS = 3500;
const SCROLL_BOTTOM_THRESHOLD_PX = 96;
const COMPOSER_MAX_HEIGHT_PX = 128;

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

export default function BuddyChat({ buddyId, meId, peer, onUnfriend, onBack, isVisible }: Props) {
  const [messages, setMessages] = useState<BuddyMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
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
  const [connection, setConnection] = useState<'connecting' | 'live' | 'retrying' | 'offline'>(
    'connecting'
  );
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [pendingBelow, setPendingBelow] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const initialLoad = useRef(true);
  const loadingHistory = useRef(false);
  const isAtBottomRef = useRef(true);
  const lastTailMessageId = useRef<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastSentTypingAt = useRef(0);
  const peerTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduceMotion = useReducedMotion();
  const coarsePointer = useMediaQuery('(pointer: coarse)');

  useEffect(() => {
    if (!menuOpen) return;
    const focusTimer = window.setTimeout(() => {
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    }, 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  // Initial fetch + realtime subscribe.
  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    setLoading(true);
    setLoadingOlder(false);
    setHasOlder(false);
    setError(null);
    setPeerTyping(false);
    setConnection('connecting');
    setMenuOpen(false);
    setConfirmUnfriend(false);
    setIsAtBottom(true);
    setPendingBelow(0);
    isAtBottomRef.current = true;
    lastTailMessageId.current = null;
    loadingHistory.current = false;
    initialLoad.current = true;

    async function load() {
      const shouldUpdateHistoryHint = initialLoad.current;
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
      if (shouldUpdateHistoryHint) setHasOlder(fetched.length === MSG_PAGE_SIZE);
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
          setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, ...row } : m)));
        }
      )
      .on('broadcast', { event: 'typing' }, (payload) => {
        const p = payload.payload as { from?: string } | undefined;
        if (!p?.from || p.from === meId) return;
        setPeerTyping(true);
        if (peerTypingTimer.current) clearTimeout(peerTypingTimer.current);
        peerTypingTimer.current = setTimeout(() => setPeerTyping(false), TYPING_TIMEOUT_MS);
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

  const loadOlder = useCallback(async () => {
    const oldest = messages[0];
    const list = listRef.current;
    if (!oldest || !list || loadingOlder || !hasOlder) return;
    const previousHeight = list.scrollHeight;
    const previousTop = list.scrollTop;
    setLoadingOlder(true);
    const { data, error: olderError } = await supabase
      .from('buddy_messages')
      .select('*')
      .eq('buddy_id', buddyId)
      .lt('created_at', oldest.created_at)
      .order('created_at', { ascending: false })
      .limit(MSG_PAGE_SIZE);
    setLoadingOlder(false);
    if (olderError) {
      setError(olderError.message);
      return;
    }
    const older = [...((data as BuddyMessageRow[]) ?? [])].reverse();
    loadingHistory.current = true;
    setMessages((current) => mergeBuddyMessages(current, older));
    setHasOlder(older.length === MSG_PAGE_SIZE);
    window.requestAnimationFrame(() => {
      const currentList = listRef.current;
      loadingHistory.current = false;
      if (!currentList) return;
      currentList.scrollTop = previousTop + currentList.scrollHeight - previousHeight;
    });
  }, [buddyId, hasOlder, loadingOlder, messages]);

  // Mark peer's unread messages as read whenever new ones arrive and we're
  // looking at the chat. Read receipts propagate via the UPDATE subscription.
  const markRead = useCallback(async () => {
    if (!isVisible || document.visibilityState !== 'visible') return;
    const unreadIds = messages
      .filter((m) => m.sender_id !== meId && m.read_at === null)
      .map((m) => m.id);
    if (unreadIds.length === 0) return;
    const now = new Date().toISOString();
    const unreadIdSet = new Set(unreadIds);
    setMessages((prev) => prev.map((m) => (unreadIdSet.has(m.id) ? { ...m, read_at: now } : m)));
    const { error } = await supabase
      .from('buddy_messages')
      .update({ read_at: now })
      .eq('buddy_id', buddyId)
      .neq('sender_id', meId)
      .in('id', unreadIds);
    if (error) {
      // Roll back the optimistic read-flag so the next attempt tries again.
      setMessages((prev) => prev.map((m) => (unreadIdSet.has(m.id) ? { ...m, read_at: null } : m)));
    }
  }, [messages, meId, buddyId, isVisible]);

  useEffect(() => {
    if (!loading) void markRead();
  }, [loading, markRead]);

  useEffect(() => {
    const markWhenVisible = () => {
      if (document.visibilityState === 'visible') void markRead();
    };
    document.addEventListener('visibilitychange', markWhenVisible);
    return () => document.removeEventListener('visibilitychange', markWhenVisible);
  }, [markRead]);

  // Suppress an OS alert only on the device that is actively viewing this
  // exact chat. Other registered devices continue to receive the message.
  useEffect(() => {
    const heartbeat = () => {
      if (isVisible && document.visibilityState === 'visible') {
        void touchActiveBuddy(buddyId).catch(() => undefined);
      } else {
        void touchActiveBuddy(null).catch(() => undefined);
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
  }, [buddyId, isVisible]);

  const measureBottom = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const next =
      list.scrollHeight - list.scrollTop - list.clientHeight < SCROLL_BOTTOM_THRESHOLD_PX;
    isAtBottomRef.current = next;
    setIsAtBottom(next);
    if (next) setPendingBelow(0);
  }, []);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      const list = listRef.current;
      if (!list) return;
      list.scrollTo({ top: list.scrollHeight, behavior: reduceMotion ? 'auto' : behavior });
      isAtBottomRef.current = true;
      setIsAtBottom(true);
      setPendingBelow(0);
    },
    [reduceMotion]
  );

  // Follow only the conversation tail. History readers keep their place.
  useEffect(() => {
    const latest = messages.at(-1);
    if (!latest) return;
    const isNewTail = latest.id !== lastTailMessageId.current;
    if (initialLoad.current) {
      scrollToBottom('auto');
    } else if (isNewTail && (isAtBottomRef.current || latest.sender_id === meId)) {
      scrollToBottom();
    } else if (isNewTail && latest.sender_id !== meId) {
      setPendingBelow((count) => count + 1);
    }
    lastTailMessageId.current = latest.id;
    if (!loading) initialLoad.current = false;
  }, [messages, loading, meId, scrollToBottom]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const nextHeight = Math.min(textarea.scrollHeight, COMPOSER_MAX_HEIGHT_PX);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > COMPOSER_MAX_HEIGHT_PX ? 'auto' : 'hidden';
  }, [draft]);

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

  const grouped = useMemo(() => groupBuddyMessages(messages), [messages]);
  const nameToShow = displayName(peer);

  return (
    <div className="native-buddy-chat relative flex h-full min-h-[420px] flex-col overflow-hidden rounded-lg border border-border bg-bg-raised">
      <header className="native-chat-header relative flex items-center gap-3 border-b border-border px-4 py-3">
        {onBack ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onBack}
            aria-label="Back to chats"
            className="native-chat-back -ml-2 rounded-full md:hidden"
          >
            <ArrowLeft size={18} strokeWidth={1.75} />
          </Button>
        ) : null}
        <BuddyAvatar name={nameToShow} size="md" online={peerOnline} />
        <span className="sr-only">{peerOnline ? 'Online' : 'Offline'}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-text">{nameToShow}</p>
          {connection === 'live' ? (
            <p className="u-num truncate text-[11px] text-text-faint">
              {peer.username
                ? `@${peer.username}`
                : peer.email || (peerOnline ? 'Online' : 'Offline')}
            </p>
          ) : (
            <p
              className={cn(
                'inline-flex items-center gap-1.5 text-[11px] font-medium',
                connection === 'offline' ? 'text-danger' : 'text-warn'
              )}
              role="status"
            >
              {connection === 'offline' ? (
                <CloudOff size={11} strokeWidth={1.75} />
              ) : (
                <RefreshCcw size={10} strokeWidth={1.75} className="animate-spin" />
              )}
              {connection === 'connecting'
                ? 'Connecting'
                : connection === 'retrying'
                  ? 'Reconnecting'
                  : 'Offline'}
            </p>
          )}
        </div>
        {onUnfriend && (
          <div className="relative">
            <Button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Chat options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              variant="ghost"
              size="icon"
              className="rounded-full text-text-faint"
            >
              <MoreVertical size={18} strokeWidth={1.75} />
            </Button>
            {menuOpen && (
              <>
                <button
                  type="button"
                  aria-hidden
                  tabIndex={-1}
                  onClick={() => {
                    setMenuOpen(false);
                    menuButtonRef.current?.focus();
                  }}
                  className="fixed inset-0 z-10 cursor-default"
                />
                <div
                  ref={menuRef}
                  className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-lg border border-border bg-bg-raised p-1 shadow-lift"
                  role="menu"
                  aria-label="Chat options"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmUnfriend(true);
                    }}
                    className="flex min-h-10 w-full items-center gap-2 rounded px-3 py-2 text-left text-[13px] text-danger transition-colors hover:bg-danger-faint"
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

      {error && (
        <div
          className="flex items-center gap-2 border-b border-border/60 px-4 py-2 text-[12px] text-warn"
          role="status"
        >
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

      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          onScroll={measureBottom}
          className="native-chat-messages h-full overflow-y-auto bg-bg/80 px-3 py-4 sm:px-4"
        >
          {loading ? (
            <p className="mt-6 text-center text-[12px] text-text-faint">Loading…</p>
          ) : messages.length === 0 ? (
            <div className="mx-auto mt-10 flex max-w-[340px] flex-col items-center gap-3 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-bg-raised text-ink-marigold shadow-sm">
                <BookOpen size={20} strokeWidth={1.5} />
              </span>
              <div>
                <p className="font-display text-[16px] font-semibold text-text">
                  Open the study desk
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
                  Ask a doubt or send a question you are working through. Your outcomes, tags, and
                  notes stay private.
                </p>
              </div>
            </div>
          ) : (
            <ul className="flex flex-col gap-4">
              {hasOlder ? (
                <li className="flex justify-center">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={loadingOlder}
                    onClick={() => void loadOlder()}
                    className="rounded-full border border-border bg-bg-raised text-[11px] text-text-muted shadow-sm"
                  >
                    {loadingOlder ? 'Loading…' : 'Load older messages'}
                  </Button>
                </li>
              ) : null}
              {grouped.map((day) => (
                <li key={day.day} className="flex flex-col gap-3">
                  <div className="u-num mx-auto rounded-full border border-border bg-bg-raised/90 px-3 py-1 text-[10px] uppercase tracking-wider text-text-faint shadow-sm">
                    {formatDate(day.day, 'EEE, dd MMM')}
                  </div>
                  {day.clusters.map((cluster) => (
                    <div key={cluster.id} className="flex flex-col gap-1">
                      {cluster.rows.map((message, index) => (
                        <MessageBubble
                          key={message.id}
                          msg={message}
                          isMe={message.sender_id === meId}
                          isGroupEnd={index === cluster.rows.length - 1}
                          animateEntrance={
                            !initialLoad.current && !loadingHistory.current && !reduceMotion
                          }
                        />
                      ))}
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </div>

        <AnimatePresence initial={false}>
          {!isAtBottom && messages.length > 0 ? (
            <motion.button
              type="button"
              initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: 6, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              onClick={() => scrollToBottom()}
              aria-label={
                pendingBelow > 0
                  ? `Jump to ${pendingBelow} new ${pendingBelow === 1 ? 'message' : 'messages'}`
                  : 'Jump to latest message'
              }
              className="absolute bottom-3 right-4 flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full border border-accent/25 bg-accent px-3 text-accent-contrast shadow-lift"
            >
              <ArrowDown size={16} strokeWidth={2} />
              {pendingBelow > 0 ? (
                <span className="u-num text-[11px] font-semibold">{pendingBelow}</span>
              ) : null}
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>

      <div
        className="native-chat-typing flex min-h-8 items-center bg-bg/80 px-4 text-[11.5px] text-text-faint"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <AnimatePresence initial={false}>
          {peerTyping && !loading ? (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: 2 }}
              className="flex items-center gap-2"
            >
              <BuddyAvatar name={nameToShow} size="xs" />
              <TypingDots />
              <span>{firstName(peer)} is typing</span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="native-chat-composer border-t border-border bg-bg-raised px-3 py-3">
        <div className="flex items-end gap-2">
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setPicker(true)}
            className="rounded-full text-text-muted"
            aria-label="Share a question"
            title="Share a question"
          >
            <BookOpen size={16} strokeWidth={1.75} />
          </Button>
          <div className="min-w-0 flex-1">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value.slice(0, TEXT_LIMIT));
                if (e.target.value.length > 0) broadcastTyping();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !coarsePointer) {
                  e.preventDefault();
                  void sendText();
                }
              }}
              placeholder={`Message ${firstName(peer)}…`}
              rows={1}
              aria-label={`Message ${firstName(peer)}`}
              className="native-chat-input block max-h-32 min-h-[40px] w-full resize-none rounded-2xl border border-border bg-bg px-4 py-2.5 text-[13.5px] leading-snug text-text shadow-press placeholder:text-text-faint transition-[border-color,box-shadow] hover:border-border-hover focus:border-accent focus:shadow-[0_0_0_3px_theme(colors.accent.faint)] focus:outline-none"
            />
            {!coarsePointer || draft.length >= TEXT_LIMIT * 0.9 ? (
              <div className="native-chat-meta mt-1 flex items-center justify-between px-1 text-[10.5px] text-text-faint">
                {!coarsePointer ? (
                  <span className="native-keyboard-hint">
                    Enter to send · Shift+Enter for newline
                  </span>
                ) : (
                  <span />
                )}
                {draft.length >= TEXT_LIMIT * 0.9 ? (
                  <span className="u-num">
                    {draft.length}/{TEXT_LIMIT}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <Button
            type="button"
            variant="primary"
            size="icon"
            onClick={() => void sendText()}
            disabled={sending || draft.trim().length === 0}
            className="rounded-full"
            aria-label="Send message"
            title="Send"
          >
            <ArrowUp size={17} strokeWidth={2.25} />
          </Button>
        </div>
      </div>

      <Dialog
        open={confirmUnfriend}
        onClose={() => setConfirmUnfriend(false)}
        title={`Unfriend ${nameToShow}?`}
      >
        <p className="text-[13px] leading-relaxed text-text-muted">
          This deletes the pair and all messages on both sides. You can send a fresh request
          afterwards.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setConfirmUnfriend(false)}>
            Keep buddy
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              setConfirmUnfriend(false);
              onUnfriend?.();
            }}
          >
            <UserX size={12} strokeWidth={1.75} /> Unfriend
          </Button>
        </div>
      </Dialog>

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

function MessageBubble({
  msg,
  isMe,
  isGroupEnd,
  animateEntrance
}: {
  msg: BuddyMessageRow;
  isMe: boolean;
  isGroupEnd: boolean;
  animateEntrance: boolean;
}) {
  const time = new Date(msg.created_at).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit'
  });
  return (
    <motion.div
      initial={animateEntrance ? { opacity: 0, y: 10, scale: 0.98 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      className={cn('flex', isMe ? 'justify-end' : 'justify-start')}
    >
      <div
        className={cn(
          'flex flex-col',
          msg.kind === 'question'
            ? 'w-full max-w-[94%] sm:max-w-[84%]'
            : 'max-w-[84%] sm:max-w-[72%]',
          isMe ? 'items-end' : 'items-start'
        )}
      >
        {msg.kind === 'question' && isSharedQuestionRef(msg.question_ref) ? (
          <QuestionCard ref_={msg.question_ref} isMe={isMe} />
        ) : msg.kind === 'question' ? (
          <div className="rounded-2xl border border-warn/30 bg-warn-faint px-3 py-2 text-[12px] text-text-muted">
            Shared question unavailable.
          </div>
        ) : (
          <div
            className={cn(
              'rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed shadow-sm',
              isMe
                ? cn('bg-accent text-accent-contrast', isGroupEnd && 'rounded-br-sm')
                : cn('border border-border bg-bg-raised text-text', isGroupEnd && 'rounded-bl-sm')
            )}
          >
            <p className="whitespace-pre-wrap break-words">{msg.body}</p>
          </div>
        )}
        {isGroupEnd ? (
          <p
            className={cn(
              'mt-1 flex items-center gap-1 px-1 text-[10.5px] tabular-nums text-text-faint',
              isMe ? 'justify-end' : 'justify-start'
            )}
          >
            <span>{time}</span>
            {isMe ? (
              msg.read_at ? (
                <CheckCheck size={11} strokeWidth={2} className="text-accent" aria-label="Read" />
              ) : (
                <Check size={11} strokeWidth={2} aria-label="Sent" />
              )
            ) : null}
          </p>
        ) : null}
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
        'relative w-full overflow-hidden rounded-lg border bg-bg-raised pl-1 shadow-card',
        isMe ? 'border-accent/35' : 'border-border'
      )}
    >
      <span className={cn('absolute inset-y-0 left-0 w-1', ink.dot)} aria-hidden="true" />
      <div className="flex items-start justify-between gap-3 border-b border-border/60 px-3 py-2.5">
        <span className="min-w-0">
          <span className="u-label flex items-center gap-1.5 text-[9.5px] text-text-faint">
            <BookOpen size={11} strokeWidth={1.75} /> Shared question
          </span>
          <span className={cn('mt-0.5 block truncate text-[12px] font-semibold', ink.text)}>
            {ref_.subject}
            {ref_.subtopic ? (
              <span className="font-normal text-text-faint"> · {ref_.subtopic}</span>
            ) : null}
          </span>
        </span>
        <span className="u-num text-[10.5px] text-text-faint">{targetMin}m target</span>
      </div>
      {ref_.image_url && (
        <img
          src={ref_.image_url}
          alt="Shared question"
          className="max-h-72 w-full border-b border-border/60 bg-bg object-contain"
        />
      )}
      <div className="space-y-2 px-3 py-3 text-[13px] leading-relaxed text-text">
        {ref_.question_text ? (
          <p className="whitespace-pre-wrap">{ref_.question_text}</p>
        ) : ref_.image_url ? (
          <p className="text-[12px] italic text-text-muted">See image.</p>
        ) : (
          <p className="text-[12px] italic text-text-muted">No text.</p>
        )}
        {sourceLine && (
          <p className="u-num text-[10.5px] uppercase tracking-wider text-text-faint">
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
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const all = await db.questions.where('user_id').equals(meId).toArray();
      if (cancelled) return;
      setRows(all.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 400));
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
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduceMotion ? undefined : { opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.18 }}
      className="native-question-picker-overlay absolute inset-0 z-30 flex items-center justify-center bg-black/25 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduceMotion ? undefined : { opacity: 0, y: 6, scale: 0.98 }}
        transition={{ duration: reduceMotion ? 0 : 0.22 }}
        onClick={(e) => e.stopPropagation()}
        className="native-question-picker-panel mx-3 flex max-h-[70vh] w-full max-w-[520px] flex-col overflow-hidden rounded-lg border border-border bg-bg-raised shadow-card"
        role="dialog"
        aria-modal="true"
        aria-label="Share a question"
      >
        <header className="native-question-picker-header flex items-center gap-2 border-b border-border px-4 py-3">
          <p className="font-display text-[14px] font-semibold text-text">Share a question</p>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-text-faint transition-colors hover:bg-bg-overlay hover:text-text"
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
            aria-label="Filter questions"
            className="native-question-picker-input block w-full rounded border border-border bg-bg px-3 py-1.5 text-[13px] text-text placeholder:text-text-faint focus:border-accent focus:shadow-[0_0_0_3px_theme(colors.accent.faint)] focus:outline-none"
          />
          <p className="mt-1 text-[10.5px] text-text-faint">
            Only the question is shared. Your outcome, pattern, and root cause never leave your
            journal.
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
                        {r.question_text ?? (r.image_url ? '(image question)' : '(no text)')}
                      </p>
                      <p className="mt-0.5 text-[10.5px] text-text-faint">
                        {r.source_ref ?? 'no source'} {r.source_year ? `· ${r.source_year}` : ''} ·{' '}
                        {formatDate(r.created_at.slice(0, 10), 'dd MMM')}
                      </p>
                    </div>
                    <ArrowUp size={12} strokeWidth={1.75} className="rotate-45 text-text-faint" />
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
