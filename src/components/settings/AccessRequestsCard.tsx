// Owner-only admin panel for outsider access requests.
// Shown as a Settings card. RLS is the authority; this card only *displays*
// what the owner is allowed to select. Approve/Decline delegate to edge fns.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, Copy, RefreshCcw, X } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Empty } from '@/components/ui/Empty';
import { Textarea } from '@/components/ui/Textarea';
import { apiClient, apiConfigured } from '@/lib/api-client';
import { approveRequest, declineRequest } from '@/lib/edge';
import { useUiStore } from '@/stores/ui';
import { cn, formatDate } from '@/lib/utils';
import type { AccountRequestRow, AccountRequestStatus } from '@/types';

type Tab = AccountRequestStatus;

export default function AccessRequestsCard({ userId }: { userId: string | null }) {
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [rows, setRows] = useState<AccountRequestRow[] | null>(null);
  const [inviteUrls, setInviteUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pushToast = useUiStore((s) => s.pushToast);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!apiConfigured || !userId) {
        setIsOwner(false);
        return;
      }
      const { data } = await apiClient.rpc('is_owner');
      if (!cancelled) setIsOwner(data === true);
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (isOwner) void reload();
  }, [isOwner]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { pending: 0, approved: 0, declined: 0 };
    (rows ?? []).forEach((r) => (c[r.status] += 1));
    return c;
  }, [rows]);

  const visible = useMemo(
    () => (rows ?? []).filter((r) => r.status === tab),
    [rows, tab]
  );

  async function reload() {
    setLoading(true);
    const { data, error } = await apiClient
      .from('account_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setError(null);
    const list = (data as AccountRequestRow[]) ?? [];
    setRows(list);

    // Load invite tokens for approved rows so we can show a copyable URL.
    const inviteIds = list
      .filter((r) => r.status === 'approved' && r.invite_id)
      .map((r) => r.invite_id as string);
    if (inviteIds.length === 0) {
      setInviteUrls({});
      return;
    }
    const { data: invites } = await apiClient
      .from('invites')
      .select('id,token,expires_at')
      .in('id', inviteIds);
    if (!invites) return;
    const now = Date.now();
    const base =
      typeof window !== 'undefined' ? `${window.location.origin}` : '';
    const map: Record<string, string> = {};
    for (const r of list) {
      if (!r.invite_id) continue;
      const inv = (invites as { id: string; token: string; expires_at: string }[]).find(
        (i) => i.id === r.invite_id
      );
      if (!inv) continue;
      if (new Date(inv.expires_at).getTime() < now) continue;
      map[r.id] = `${base}/signup?invite=${encodeURIComponent(inv.token)}`;
    }
    setInviteUrls(map);
  }

  if (isOwner !== true) return null;

  async function onApprove(req: AccountRequestRow) {
    setBusyId(req.id);
    const res = await approveRequest(req.id);
    setBusyId(null);
    if ('ok' in res && res.ok) {
      if (res.mail_sent) {
        pushToast(`Approved. Invite mailed to ${req.email}.`, 'success');
      } else {
        pushToast(
          `Approved. Mail failed (${res.mail_error ?? 'unknown'}) — copy the invite URL from the Approved tab and send it manually.`,
          'neutral'
        );
      }
      void reload();
      return;
    }
    pushToast(res.error, 'neutral');
  }

  async function onDecline(req: AccountRequestRow, reason: string, notify: boolean) {
    setBusyId(req.id);
    const res = await declineRequest(req.id, { reason: reason || undefined, notify });
    setBusyId(null);
    if ('ok' in res && res.ok) {
      pushToast(
        notify
          ? `Declined. ${res.mail_sent ? 'Note mailed.' : 'Mail failed.'}`
          : 'Declined silently.',
        'success'
      );
      void reload();
      return;
    }
    pushToast(res.error, 'neutral');
  }

  return (
    <Card id="requests">
      <CardHeader
        title="Signup access requests"
        aside={
          <div className="flex items-center gap-2">
            <TabButton
              on={tab === 'pending'}
              onClick={() => setTab('pending')}
              label="Pending"
              count={counts.pending}
              tone="accent"
            />
            <TabButton
              on={tab === 'approved'}
              onClick={() => setTab('approved')}
              label="Approved"
              count={counts.approved}
              tone="success"
            />
            <TabButton
              on={tab === 'declined'}
              onClick={() => setTab('declined')}
              label="Declined"
              count={counts.declined}
              tone="muted"
            />
            <Button variant="ghost" size="sm" onClick={() => void reload()} disabled={loading}>
              <RefreshCcw size={12} strokeWidth={1.75} className="mr-1" />
              Refresh
            </Button>
          </div>
        }
      />
      <div className="border-b border-border/60 px-4 py-1.5 text-[11px] text-text-faint">
        Outsiders asking for an invite to sign up. Buddy requests live in <Link to="/buddy" className="underline hover:text-text">/buddy → Requests</Link>.
      </div>
      {error && (
        <div className="border-b border-border/60 px-4 py-2 text-[12px] text-warn">{error}</div>
      )}
      {loading && !rows ? (
        <div className="px-4 py-6 text-[12px] text-text-faint">Loading…</div>
      ) : visible.length === 0 ? (
        <Empty
          title={
            tab === 'pending'
              ? 'No pending requests'
              : tab === 'approved'
                ? 'No approvals yet'
                : 'No declines yet'
          }
          hint={
            tab === 'pending'
              ? 'When someone asks for access, their name and purpose land here.'
              : undefined
          }
          className="border-0 py-8"
        />
      ) : (
        <ul className="divide-y divide-border">
          <AnimatePresence initial={false}>
            {visible.map((r) => (
              <motion.li
                key={r.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
                className="px-4 py-3"
              >
                <RequestRow
                  req={r}
                  inviteUrl={inviteUrls[r.id]}
                  busy={busyId === r.id}
                  onApprove={() => void onApprove(r)}
                  onDecline={(reason, notify) => void onDecline(r, reason, notify)}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Card>
  );
}

function TabButton({
  on,
  onClick,
  label,
  count,
  tone
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  count: number;
  tone: 'accent' | 'success' | 'muted';
}) {
  const toneOn: Record<typeof tone, string> = {
    accent: 'bg-accent-faint text-accent',
    success: 'bg-success/10 text-success',
    muted: 'bg-bg-overlay text-text'
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors',
        on
          ? `${toneOn[tone]} border-transparent font-semibold`
          : 'border-border/60 text-text-muted hover:border-border-hover'
      )}
    >
      {label}
      <span className={cn('u-num tabular-nums', on ? 'opacity-90' : 'opacity-70')}>{count}</span>
    </button>
  );
}

function RequestRow({
  req,
  inviteUrl,
  busy,
  onApprove,
  onDecline
}: {
  req: AccountRequestRow;
  inviteUrl?: string;
  busy: boolean;
  onApprove: () => void;
  onDecline: (reason: string, notify: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(true);

  const isPending = req.status === 'pending';
  const decidedLabel =
    req.decided_at &&
    `${req.status === 'approved' ? 'Approved' : 'Declined'} ${formatDate(req.decided_at.slice(0, 10), 'dd MMM')}`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="truncate font-display text-[14px] font-semibold text-text">{req.name}</p>
            <StatusBadge status={req.status} />
          </div>
          <p className="mt-0.5 truncate text-[12px] text-text-muted">
            <span className="u-num">{req.email}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-text-faint">
            {formatDate(req.created_at.slice(0, 10), 'dd MMM')}
          </span>
          <CopyButton value={req.email} />
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded p-1 text-text-faint hover:text-text"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <ChevronDown
              size={14}
              strokeWidth={1.75}
              className={cn('transition-transform', expanded && 'rotate-180')}
            />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="mt-3 rounded border border-border bg-bg-overlay/40 px-3 py-3">
              <p className="u-label mb-1">Purpose</p>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-text">
                {req.purpose}
              </p>
              {decidedLabel && (
                <p className="mt-3 text-[11.5px] text-text-faint">
                  {decidedLabel}
                  {req.notes && req.status === 'declined' ? ` · reason logged` : ''}
                </p>
              )}
              {req.notes && req.status === 'declined' && (
                <p className="mt-1 whitespace-pre-wrap rounded border border-border/60 bg-bg-raised px-2 py-1.5 text-[12px] text-text-muted">
                  {req.notes}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {req.status === 'approved' && inviteUrl && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded border border-success/30 bg-success/5 px-3 py-2">
          <span className="u-label text-success shrink-0">invite url</span>
          <code className="u-num flex-1 min-w-0 truncate text-[11.5px] text-text">
            {inviteUrl}
          </code>
          <CopyButton value={inviteUrl} label="Copy invite URL" />
        </div>
      )}

      {isPending && (
        <div className="mt-3">
          {!declining ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={onApprove}
                disabled={busy}
                title="Create invite + mail requester"
              >
                <Check size={12} strokeWidth={2} className="mr-1" />
                {busy ? 'Approving…' : 'Approve + send invite'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeclining(true)}
                disabled={busy}
              >
                <X size={12} strokeWidth={2} className="mr-1" />
                Decline
              </Button>
            </div>
          ) : (
            <div className="mt-2 rounded border border-border/70 bg-bg-overlay/50 px-3 py-3">
              <p className="u-label mb-1.5">Reason (optional — the requester sees this if you notify)</p>
              <Textarea
                rows={3}
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Not a fit for this cohort right now."
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-[12px] text-text-muted">
                  <input
                    type="checkbox"
                    checked={notify}
                    onChange={(e) => setNotify(e.target.checked)}
                    className="accent-accent"
                  />
                  Email a polite decline
                </label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDeclining(false);
                      setReason('');
                    }}
                    disabled={busy}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => onDecline(reason.trim(), notify)}
                    disabled={busy}
                  >
                    {busy ? 'Declining…' : 'Confirm decline'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: AccountRequestStatus }) {
  const map: Record<AccountRequestStatus, { tone: 'neutral' | 'success' | 'warn'; label: string }> = {
    pending: { tone: 'warn', label: 'pending' },
    approved: { tone: 'success', label: 'approved' },
    declined: { tone: 'neutral', label: 'declined' }
  };
  const spec = map[status];
  return <Badge tone={spec.tone}>{spec.label}</Badge>;
}

function CopyButton({ value, label = 'Copy email' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          // clipboard permission denied — nothing to do.
        }
      }}
      aria-label={label}
      title={copied ? 'Copied' : label}
      className="rounded p-1 text-text-faint hover:text-text shrink-0"
    >
      {copied ? <Check size={12} strokeWidth={2} /> : <Copy size={12} strokeWidth={1.75} />}
    </button>
  );
}
