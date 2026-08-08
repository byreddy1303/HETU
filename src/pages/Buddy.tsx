// /buddy — DM-style buddy page with tabs.
//
// Layout on desktop:
//   Left  : tabbed list — Chats | Requests | Paused
//   Right : BuddyChat for the selected buddy (or empty state)
// On mobile: stack; tapping a buddy pushes the chat pane in place.
//
// Notes on structure that fix earlier bugs:
//   - Peer name resolution uses list_buddy_peers() RPC; if the RPC fails or
//     returns nothing we still synthesize a peer object from the buddies row
//     so the chat can OPEN and the header shows a stable label
//     (@ username fallback or 'Buddy'). Chat opening MUST NOT depend on the
//     RPC succeeding — that was the previous silent-fail bug.
//   - Buddy requests (incoming + outgoing pending) live inside this page in a
//     dedicated Requests tab with a count badge — they never go to Settings.
//   - A Realtime subscription on public.buddies keeps the tabs live: new
//     incoming requests, accepts, and declines show up without a refresh.
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  Check,
  MessageSquarePlus,
  RefreshCcw,
  Search,
  UserPlus,
  X
} from 'lucide-react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import PageHeader from '@/components/layout/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Textarea } from '@/components/ui/Textarea';
import BuddyChat from '@/components/buddy/BuddyChat';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { sendBuddyRequest } from '@/lib/edge';
import { useAuth } from '@/hooks/useAuth';
import { useUiStore } from '@/stores/ui';
import type { BuddyMessageRow, BuddyRow, UserRow } from '@/types';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface BuddyRowExt extends BuddyRow {
  requested_by: string | null;
  responded_at: string | null;
  decline_reason: string | null;
}

type PeerLite = Pick<UserRow, 'id' | 'name' | 'email' | 'username'>;

interface BuddyView {
  row: BuddyRowExt;
  peer: PeerLite;
  last?: BuddyMessageRow | null;
  unreadCount: number;
}

type BuddyTab = 'chats' | 'requests' | 'paused';

const USERNAME_RE = /^[a-z0-9_]{3,32}$/;

/** Build a stable placeholder peer object so the UI never has a null peer. */
function placeholderPeer(peerId: string | null | undefined): PeerLite {
  const safeId = (peerId ?? '').toString();
  const short = safeId.slice(0, 6) || 'buddy';
  return {
    id: safeId,
    name: `Buddy ${short}`,
    email: '',
    username: short
  };
}

/** Never render a raw undefined/null in the peer's username or name. */
function normalizePeer(p: PeerLite | undefined | null, peerId: string): PeerLite {
  if (!p) return placeholderPeer(peerId);
  const fallback = placeholderPeer(peerId);
  return {
    id: p.id || fallback.id,
    name: (p.name && p.name.trim()) || fallback.name,
    email: p.email ?? '',
    username: (p.username && p.username.trim()) || fallback.username
  };
}

/** Uniform display name across the buddy UI. */
function peerDisplay(p: PeerLite): string {
  const nm = (p.name || '').trim();
  if (nm) return nm;
  const un = (p.username || '').trim();
  return un ? `@${un}` : 'Buddy';
}

/** @-handle for the preview line; falls back to 'buddy' if empty. */
function peerHandle(p: PeerLite): string {
  return (p.username || '').trim() || 'buddy';
}

export default function Buddy() {
  const { userId, sandbox } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [buddies, setBuddies] = useState<BuddyView[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<BuddyTab>('chats');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uname, setUname] = useState('');
  const [sending, setSending] = useState(false);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [declineTarget, setDeclineTarget] = useState<BuddyView | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const pushToast = useUiStore((s) => s.pushToast);

  const reload = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('buddies')
      .select('*')
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .order('created_at', { ascending: false });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    const rows = (data as BuddyRowExt[]) ?? [];

    // users RLS blocks SELECT of anyone but self; the security-definer RPC
    // returns minimal profile info for peers we share a buddies row with.
    // If the RPC errors (missing migration, network hiccup) we fall through
    // with placeholder peers rather than blocking chat.
    const peerMap = new Map<string, PeerLite>();
    if (rows.length > 0) {
      const { data: peers, error: peersErr } = await supabase.rpc('list_buddy_peers');
      if (peersErr) {
        console.warn('[buddy] list_buddy_peers failed:', peersErr.message);
      }
      for (const p of (peers as PeerLite[] | null) ?? []) {
        peerMap.set(p.id, p);
      }
    }

    const list: BuddyView[] = rows.map((r) => {
      const peerId = r.user_a === userId ? r.user_b : r.user_a;
      return {
        row: r,
        peer: normalizePeer(peerMap.get(peerId), peerId),
        unreadCount: 0
      };
    });

    // Fetch last-message preview per active pair (small parallel calls).
    const activeRows = list.filter((v) => v.row.status === 'active').slice(0, 30);
    await Promise.all(
      activeRows.map(async (v) => {
        const [{ data: msg }, { count }] = await Promise.all([
          supabase
            .from('buddy_messages')
            .select('id, buddy_id, sender_id, kind, body, question_ref, created_at, read_at')
            .eq('buddy_id', v.row.id)
            .order('created_at', { ascending: false })
            .limit(1),
          supabase
            .from('buddy_messages')
            .select('id', { count: 'exact', head: true })
            .eq('buddy_id', v.row.id)
            .neq('sender_id', userId)
            .is('read_at', null)
        ]);
        v.last = ((msg as BuddyMessageRow[]) ?? [])[0] ?? null;
        v.unreadCount = count ?? 0;
      })
    );

    setBuddies(list);
    setLoading(false);
  }, [userId]);

  const refreshPreview = useCallback(async (buddyId: string) => {
    if (!userId) return;
    const [{ data: message }, { count }] = await Promise.all([
      supabase
        .from('buddy_messages')
        .select('id, buddy_id, sender_id, kind, body, question_ref, created_at, read_at')
        .eq('buddy_id', buddyId)
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('buddy_messages')
        .select('id', { count: 'exact', head: true })
        .eq('buddy_id', buddyId)
        .neq('sender_id', userId)
        .is('read_at', null)
    ]);
    const last = ((message as BuddyMessageRow[]) ?? [])[0] ?? null;
    setBuddies((current) =>
      current.map((view) =>
        view.row.id === buddyId ? { ...view, last, unreadCount: count ?? 0 } : view
      )
    );
  }, [userId]);

  useEffect(() => {
    if (!userId || sandbox || !supabaseConfigured) {
      setBuddies([]);
      return;
    }
    void reload();
  }, [userId, sandbox, reload]);

  // Live message previews and unread badges for every active thread.
  useEffect(() => {
    if (!userId || sandbox || !supabaseConfigured) return;
    const channel = supabase
      .channel(`buddy-previews:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'buddy_messages' },
        (payload) => {
          const row = (payload.new && Object.keys(payload.new).length > 0 ? payload.new : payload.old) as Partial<BuddyMessageRow>;
          if (row.buddy_id) void refreshPreview(row.buddy_id);
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, sandbox, refreshPreview]);

  // Live tab updates: any change on public.buddies that includes us triggers
  // a reload so incoming requests / accepts / declines land without refresh.
  useEffect(() => {
    if (!userId || sandbox || !supabaseConfigured) return;
    const channel: RealtimeChannel = supabase
      .channel(`buddies:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'buddies',
          filter: `user_a=eq.${userId}`
        },
        () => void reload()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'buddies',
          filter: `user_b=eq.${userId}`
        },
        () => void reload()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, sandbox, reload]);

  async function onSendRequest(e: FormEvent) {
    e.preventDefault();
    const cleaned = uname.trim().toLowerCase().replace(/^@+/, '');
    if (!USERNAME_RE.test(cleaned)) {
      pushToast('Enter a valid username (3–32 lowercase letters/digits/_).', 'neutral');
      return;
    }
    setSending(true);
    const res = await sendBuddyRequest(cleaned);
    setSending(false);
    if (!('ok' in res && res.ok)) {
      pushToast(res.error, 'neutral');
      return;
    }
    switch (res.status) {
      case 'no_such_user':
        pushToast(`No user with username @${cleaned}. Check the spelling.`, 'neutral');
        return;
      case 'invalid_username':
        pushToast('Usernames are 3–32 characters, lowercase letters/digits/underscore.', 'neutral');
        return;
      case 'self':
        pushToast("That's you.", 'neutral');
        return;
      case 'rate_limit':
        pushToast('You have hit the daily request limit. Try again tomorrow.', 'neutral');
        return;
      case 'cooldown':
        pushToast(`@${cleaned} recently declined. Re-request after 24 hours.`, 'neutral');
        return;
      case 'already_pending':
        pushToast(`You already have a pending request to @${cleaned}.`, 'neutral');
        break;
      case 'active':
        pushToast(`@${cleaned} is already your active buddy.`, 'neutral');
        break;
      default:
        pushToast(`Request sent to @${cleaned}.`, 'success');
        break;
    }
    setUname('');
    setShowAddPanel(false);
    void reload();
  }

  async function onRespond(bId: string, action: 'accept' | 'decline', reason = '') {
    setBusyId(bId);
    try {
      const { error } = await supabase.rpc('respond_buddy_request', {
        b_id: bId,
        action,
        reason: reason.trim() || null
      });
      if (error) {
        pushToast(error.message, 'neutral');
        return;
      }
      if (action === 'accept') {
        pushToast('Pair active. Say hi.', 'success');
        setActiveId(bId);
        setTab('chats');
        setMobileView('chat');
      } else {
        pushToast('Request declined.', 'success');
        setDeclineTarget(null);
        setDeclineReason('');
      }
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function onCancelRequest(bId: string) {
    setBusyId(bId);
    try {
      const { error } = await supabase.rpc('cancel_buddy_request', { b_id: bId });
      if (error) {
        pushToast(error.message, 'neutral');
        return;
      }
      pushToast('Request cancelled.', 'neutral');
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function onRetry(buddy: BuddyView) {
    setBusyId(buddy.row.id);
    try {
      const username = peerHandle(buddy.peer);
      const response = await sendBuddyRequest(username);
      if (!('ok' in response && response.ok)) {
        pushToast(response.error, 'neutral');
        return;
      }
      if (response.status === 'cooldown') {
        pushToast(`@${username} can be requested again after the 24-hour cooldown.`, 'neutral');
        return;
      }
      pushToast(`Request sent to @${username}.`, 'success');
      setTab('requests');
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function onUnfriend(bId: string) {
    const { error } = await supabase.rpc('unfriend_buddy', { b_id: bId });
    if (error) {
      pushToast(error.message, 'neutral');
      return;
    }
    pushToast('Unfriended.', 'neutral');
    if (activeId === bId) {
      setActiveId(null);
      setMobileView('list');
    }
    void reload();
  }

  const incoming = useMemo(
    () => buddies.filter((b) => b.row.status === 'pending' && b.row.requested_by !== userId),
    [buddies, userId]
  );
  const outgoing = useMemo(
    () => buddies.filter((b) => b.row.status === 'pending' && b.row.requested_by === userId),
    [buddies, userId]
  );
  const paused = useMemo(() => buddies.filter((b) => b.row.status === 'paused'), [buddies]);
  const active = useMemo(
    () =>
      buddies
        .filter((b) => b.row.status === 'active')
        .sort((a, b) => {
          const ta = a.last?.created_at ?? a.row.created_at;
          const tb = b.last?.created_at ?? b.row.created_at;
          return tb.localeCompare(ta);
        }),
    [buddies]
  );
  const activeBuddy = active.find((b) => b.row.id === activeId) ?? null;
  const linkedChatId = searchParams.get('chat');

  useEffect(() => {
    if (active.length === 0) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    if (linkedChatId && active.some((buddy) => buddy.row.id === linkedChatId)) {
      if (activeId !== linkedChatId) setActiveId(linkedChatId);
      setMobileView('chat');
      return;
    }
    if (!active.some((buddy) => buddy.row.id === activeId)) {
      setActiveId(active[0].row.id);
    }
  }, [active, activeId, linkedChatId]);

  const showLocalMsg = sandbox || !supabaseConfigured;

  if (showLocalMsg) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Buddy" description="One peer at a time." />
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12.5px] text-text-muted">
              Sandbox / local-only mode. Buddy features rely on Supabase auth.
            </p>
            <Link to="/settings">
              <Button variant="ghost" size="sm">
                Open Settings
              </Button>
            </Link>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="native-buddy-page flex h-[calc(100dvh-8rem)] flex-col gap-3">
      <div className="native-buddy-header flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-[22px] font-bold leading-tight text-text">
            Buddy
          </h1>
          <p className="text-[12.5px] text-text-muted">
            Chats stay between you and one peer. Sharing a question hides your tags.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void reload()} disabled={loading}>
            <RefreshCcw size={11} strokeWidth={1.75} className="mr-1" />
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowAddPanel((v) => !v)}
          >
            <UserPlus size={11} strokeWidth={2} className="mr-1" />
            New buddy
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {showAddPanel && (
          <motion.div
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Card>
              <CardBody>
                <form onSubmit={onSendRequest} className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[240px] flex-1">
                    <label htmlFor="b-uname" className="u-label mb-1 block">
                      Their username
                    </label>
                    <div className="flex h-10 items-stretch overflow-hidden rounded border border-border bg-bg-raised transition-[border-color,box-shadow] focus-within:border-accent focus-within:shadow-[0_0_0_3px_theme(colors.accent.faint)]">
                      <span className="flex select-none items-center border-r border-border bg-bg-overlay/60 px-3 font-display text-[14px] font-semibold text-text-muted">
                        @
                      </span>
                      <input
                        id="b-uname"
                        type="text"
                        placeholder="rank_notebook"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        maxLength={32}
                        value={uname}
                        onChange={(e) =>
                          setUname(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                        }
                        disabled={sending}
                        className="block flex-1 bg-transparent px-3 text-[13.5px] text-text placeholder:text-text-faint focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                        autoFocus
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-text-faint">
                      Exact match — case-insensitive. They'll see your request in Buddy.
                    </p>
                  </div>
                  <Button type="submit" variant="primary" disabled={sending || uname.length < 3}>
                    <Search size={12} strokeWidth={2} className="mr-1" />
                    {sending ? 'Sending…' : 'Send'}
                  </Button>
                </form>
              </CardBody>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="native-buddy-layout grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden md:grid-cols-[300px_minmax(0,1fr)]">
        {/* Buddies list */}
        <div
          className={cn(
            'native-buddy-list flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-bg-raised',
            mobileView === 'chat' ? 'hidden md:flex' : 'flex'
          )}
        >
          <div className="flex items-center gap-1 border-b border-border px-2 py-2">
            <TabPill
              on={tab === 'chats'}
              onClick={() => setTab('chats')}
              label="Chats"
              count={active.length}
            />
            <TabPill
              on={tab === 'requests'}
              onClick={() => setTab('requests')}
              label="Requests"
              count={incoming.length + outgoing.length}
              highlight={incoming.length > 0}
            />
            <TabPill
              on={tab === 'paused'}
              onClick={() => setTab('paused')}
              label="Paused"
              count={paused.length}
            />
          </div>

          {tab === 'chats' && (
            <ChatsTab
              loading={loading}
              active={active}
              activeId={activeId}
              userId={userId}
              onPick={(id) => {
                setActiveId(id);
                setSearchParams({ chat: id }, { replace: true });
                setBuddies((current) =>
                  current.map((buddy) =>
                    buddy.row.id === id ? { ...buddy, unreadCount: 0 } : buddy
                  )
                );
                setMobileView('chat');
              }}
              onNew={() => setShowAddPanel(true)}
            />
          )}

          {tab === 'requests' && (
            <RequestsTab
              incoming={incoming}
              outgoing={outgoing}
              busyId={busyId}
              onRespond={(id, action) => {
                if (action === 'accept') {
                  void onRespond(id, action);
                } else {
                  const target = incoming.find((request) => request.row.id === id) ?? null;
                  setDeclineTarget(target);
                  setDeclineReason('');
                }
              }}
              onCancel={(id) => void onCancelRequest(id)}
              onNew={() => setShowAddPanel(true)}
            />
          )}

          {tab === 'paused' && (
            <PausedTab rows={paused} busyId={busyId} onRetry={(buddy) => void onRetry(buddy)} />
          )}
        </div>

        {/* Chat pane */}
        <div
          className={cn(
            'native-buddy-pane min-h-0 overflow-hidden',
            mobileView === 'list' ? 'hidden md:block' : 'block'
          )}
        >
          {activeBuddy && userId ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="native-buddy-back-row mb-2 flex items-center gap-2 md:hidden">
                <button
                  type="button"
                  onClick={() => setMobileView('list')}
                  className="inline-flex items-center gap-1 rounded border border-border bg-bg-raised px-2 py-1 text-[12px] text-text-muted"
                >
                  <ArrowLeft size={12} strokeWidth={1.75} /> Back
                </button>
              </div>
              <div className="min-h-0 flex-1">
                <BuddyChat
                  buddyId={activeBuddy.row.id}
                  meId={userId}
                  peer={activeBuddy.peer}
                  onUnfriend={() => void onUnfriend(activeBuddy.row.id)}
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-bg-overlay/40 p-6 text-center">
              <MessageSquarePlus size={28} strokeWidth={1.5} className="text-text-faint" />
              <p className="font-display text-[15px] font-semibold text-text">Start a chat</p>
              <p className="max-w-[320px] text-[12.5px] leading-relaxed text-text-muted">
                Pick a buddy from the list, or add one with the{' '}
                <span className="u-num text-text">New buddy</span> button. Your first message
                opens the room.
              </p>
              {active.length === 0 && (
                <Button size="sm" variant="primary" onClick={() => setShowAddPanel(true)}>
                  <UserPlus size={11} strokeWidth={2} className="mr-1" />
                  New buddy
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded border border-warn/40 bg-warn/5 px-3 py-2 text-[12px] text-warn">
          {error}
        </div>
      )}

      <Dialog
        open={declineTarget !== null}
        onClose={() => {
          if (busyId) return;
          setDeclineTarget(null);
          setDeclineReason('');
        }}
        title="Decline buddy request"
      >
        <p className="text-[13px] leading-relaxed text-text-muted">
          Decline {declineTarget ? peerDisplay(declineTarget.peer) : 'this request'}? They can
          request again after 24 hours. A reason is optional.
        </p>
        <Textarea
          value={declineReason}
          onChange={(event) => setDeclineReason(event.target.value.slice(0, 240))}
          placeholder="Optional reason"
          rows={3}
          className="mt-3"
          disabled={busyId !== null}
          autoFocus
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={busyId !== null}
            onClick={() => setDeclineTarget(null)}
          >
            Keep request
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={!declineTarget || busyId !== null}
            onClick={() => {
              if (declineTarget) void onRespond(declineTarget.row.id, 'decline', declineReason);
            }}
          >
            {busyId ? 'Declining…' : 'Decline'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

/* ------------------------------- tab panels ------------------------------- */

function ChatsTab({
  loading,
  active,
  activeId,
  userId,
  onPick,
  onNew
}: {
  loading: boolean;
  active: BuddyView[];
  activeId: string | null;
  userId: string | null;
  onPick: (id: string) => void;
  onNew: () => void;
}) {
  if (loading && active.length === 0) {
    return <p className="px-4 py-4 text-[12px] text-text-faint">Loading…</p>;
  }
  if (active.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 p-4">
        <p className="text-[12.5px] text-text-muted">
          No active buddies yet. Send a request or accept an incoming one to start chatting.
        </p>
        <Button size="sm" variant="primary" onClick={onNew}>
          <MessageSquarePlus size={11} strokeWidth={2} className="mr-1" />
          New buddy
        </Button>
      </div>
    );
  }
  return (
    <ul className="flex-1 overflow-y-auto">
      {active.map((b) => {
        const displayName = peerDisplay(b.peer);
        return (
          <li key={b.row.id}>
            <button
              type="button"
              onClick={() => onPick(b.row.id)}
              className={cn(
                'flex w-full items-center gap-3 px-3 py-3 text-left transition-colors',
                activeId === b.row.id ? 'bg-accent-faint/40' : 'hover:bg-bg-overlay/60'
              )}
            >
              <Avatar name={displayName} active={activeId === b.row.id} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[13.5px] font-semibold text-text">
                    {displayName}
                  </p>
                  {b.last && (
                    <span className="u-num shrink-0 text-[10.5px] text-text-faint">
                      {shortTime(b.last.created_at)}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[11.5px] text-text-faint">
                  {b.last
                    ? previewOf(b.last, b.last.sender_id === userId)
                    : `@${peerHandle(b.peer)} · say hi`}
                </p>
              </div>
              {b.unreadCount > 0 && (
                <span className="u-num flex min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-contrast">
                  {b.unreadCount > 99 ? '99+' : b.unreadCount}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function RequestsTab({
  incoming,
  outgoing,
  busyId,
  onRespond,
  onCancel,
  onNew
}: {
  incoming: BuddyView[];
  outgoing: BuddyView[];
  busyId: string | null;
  onRespond: (id: string, action: 'accept' | 'decline') => void;
  onCancel: (id: string) => void;
  onNew: () => void;
}) {
  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 p-4">
        <p className="text-[12.5px] text-text-muted">
          No pending requests. Add a buddy by username or wait for someone to send you one.
        </p>
        <Button size="sm" variant="primary" onClick={onNew}>
          <UserPlus size={11} strokeWidth={2} className="mr-1" />
          New buddy
        </Button>
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto">
      {incoming.length > 0 && (
        <section>
          <p className="u-label px-3 pb-1.5 pt-3">Incoming · {incoming.length}</p>
          <ul className="divide-y divide-border">
            {incoming.map((b) => {
              const displayName = peerDisplay(b.peer);
              return (
                <li key={b.row.id} className="flex flex-wrap items-center gap-2 px-3 py-3">
                  <Avatar name={displayName} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-text">
                      {displayName}
                    </p>
                    <p className="u-num truncate text-[11px] text-text-faint">
                      @{b.peer.username}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => onRespond(b.row.id, 'accept')}
                      disabled={busyId === b.row.id}
                    >
                      <Check size={11} strokeWidth={2} className="mr-1" /> Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onRespond(b.row.id, 'decline')}
                      disabled={busyId === b.row.id}
                    >
                      <X size={11} strokeWidth={2} />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {outgoing.length > 0 && (
        <section className="border-t border-border/70">
          <p className="u-label px-3 pb-1.5 pt-3">Sent · {outgoing.length}</p>
          <ul className="divide-y divide-border">
            {outgoing.map((b) => (
              <li key={b.row.id} className="flex items-center gap-3 px-3 py-2.5">
                <Avatar name={b.peer.name || `@${b.peer.username}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-text">
                    {b.peer.name || `@${b.peer.username}`}
                  </p>
                  <p className="u-num truncate text-[11px] text-text-faint">
                    @{b.peer.username}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyId === b.row.id}
                  onClick={() => onCancel(b.row.id)}
                >
                  {busyId === b.row.id ? 'Cancelling…' : 'Cancel'}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PausedTab({
  rows,
  busyId,
  onRetry
}: {
  rows: BuddyView[];
  busyId: string | null;
  onRetry: (buddy: BuddyView) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="p-4 text-[12.5px] text-text-muted">Nothing paused.</p>
    );
  }
  return (
    <ul className="flex-1 divide-y divide-border overflow-y-auto">
      {rows.map((b) => (
        <li key={b.row.id} className="flex items-center gap-3 px-3 py-2.5">
          <Avatar name={b.peer.name || `@${b.peer.username}`} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-text">
              {b.peer.name || `@${b.peer.username}`}
            </p>
            <p className="u-num truncate text-[11px] text-text-faint">
              @{b.peer.username}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            disabled={busyId === b.row.id}
            onClick={() => onRetry(b)}
          >
            {busyId === b.row.id ? 'Sending…' : 'Request again'}
          </Button>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------- primitives ------------------------------- */

function TabPill({
  on,
  onClick,
  label,
  count,
  highlight = false
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  count: number;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors',
        on
          ? 'bg-accent-faint text-accent'
          : 'text-text-muted hover:bg-bg-overlay/60 hover:text-text'
      )}
    >
      {label}
      {count > 0 && (
        <span
          className={cn(
            'u-num rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
            highlight
              ? 'bg-warn/15 text-warn'
              : on
                ? 'bg-accent/15 text-accent'
                : 'bg-bg-overlay text-text-muted'
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function Avatar({ name, active = false }: { name: string; active?: boolean }) {
  const initial = (name || '?').trim().replace(/^@/, '')[0]?.toUpperCase() ?? '?';
  return (
    <span
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-[14px] font-bold',
        active ? 'bg-accent text-accent-contrast' : 'bg-ink-cobalt/15 text-ink-cobalt'
      )}
    >
      {initial}
    </span>
  );
}

function shortTime(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const sameDay = then.toDateString() === now.toDateString();
  if (sameDay) {
    return then.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  const diffDays = Math.floor((+now - +then) / 86400000);
  if (diffDays < 7) {
    return then.toLocaleDateString(undefined, { weekday: 'short' });
  }
  return formatDate(iso.slice(0, 10), 'dd MMM');
}

function previewOf(m: BuddyMessageRow, isMine: boolean): string {
  const prefix = isMine ? 'You: ' : '';
  if (m.kind === 'question') {
    const subj = m.question_ref?.subject ?? 'question';
    return `${prefix}[shared ${subj} question]`;
  }
  return `${prefix}${(m.body ?? '').replace(/\s+/g, ' ').slice(0, 60)}`;
}
