// /settings — settings that actually change day-to-day behaviour. Preferences
// live in a localStorage-backed zustand store; profile fields (name, exam,
// timezone, rank) round-trip through Supabase (or Dexie meta in sandbox);
// invites + local data operations are one click each.
import { useEffect, useMemo, useRef, useState } from 'react';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import {
  Check,
  Copy,
  Download,
  Lightbulb,
  LogOut,
  Plus,
  RefreshCcw,
  RotateCcw,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import PageHeader from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Empty } from '@/components/ui/Empty';
import AccessRequestsCard from '@/components/settings/AccessRequestsCard';
import NotificationsCard from '@/components/settings/NotificationsCard';
import BuddyNotificationsCard from '@/components/settings/BuddyNotificationsCard';
import { useAuthStore, type ProfilePatch } from '@/stores/auth';
import { useAuth } from '@/hooks/useAuth';
import { useUiStore } from '@/stores/ui';
import {
  DEFAULT_PREFERENCES,
  WEEKDAYS,
  daysSinceBackup,
  needsBackupReminder,
  usePrefsStore,
  type DurationMin,
  type FontScale,
  type Preferences
} from '@/stores/prefs';
import type { ThemeMode } from '@/lib/theme';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { wipeLocalState } from '@/lib/isolation';
import {
  EXAM_DATE_DEFAULT,
  INVITE_TTL_DAYS,
  QUESTION_COUNT_CHOICES,
  SUBJECTS,
  TARGET_DURATIONS_MIN,
  TIMEZONES
} from '@/lib/constants';
import { cn, formatDate, uuid } from '@/lib/utils';
import { haptic, isNativeApp } from '@/lib/native';
import { collectProgressReport, downloadProgressReport } from '@/lib/progress-export';
import {
  BACKUP_VERSION,
  downloadEnvelope,
  exportAll,
  importEnvelope,
  isBackupEnvelope
} from '@/lib/backup';
import type { InviteRow, UserRow } from '@/types';

function humanCountdown(exam: string, today: Date): string {
  const days = differenceInCalendarDays(parseISO(exam), today);
  if (days < 0) return `${Math.abs(days)} days past`;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `T−${days} days`;
}

export default function Settings() {
  const { userId, sandbox } = useAuth();
  const profile = useAuthStore((s) => s.profile);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const signOut = useAuthStore((s) => s.signOut);
  const pushToast = useUiStore((s) => s.pushToast);
  const prefs = usePrefsStore();

  const [signingOut, setSigningOut] = useState(false);
  async function onSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  const backupNudge = sandbox && needsBackupReminder(prefs);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Settings"
        description={
          sandbox
            ? 'Local sandbox — changes save to this device only.'
            : 'Everything here saves as you edit. Profile fields sync; preferences stay on this device.'
        }
      />

      {backupNudge && prefs.backupReminderDays > 0 && (
        <div className="flex items-start gap-3 rounded border border-warn/40 bg-warn/5 px-3 py-2">
          <Lightbulb size={14} className="mt-0.5 shrink-0 text-warn" strokeWidth={1.75} />
          <div className="flex-1 text-[12.5px] text-text">
            <p className="font-medium">Backup nudge</p>
            <p className="text-text-muted">
              You asked to be reminded every {prefs.backupReminderDays} days.
              {prefs.lastBackupAt
                ? ` Last export: ${formatDate(prefs.lastBackupAt.slice(0, 10), 'dd MMM')} · ${daysSinceBackup(prefs.lastBackupAt)}d ago.`
                : ' No export on record yet.'}
            </p>
          </div>
        </div>
      )}

      {/* --- Daily plan ---------------------------------------------------- */}
      <Card>
        <CardHeader title="Daily plan" aside={<PrefBadge label="on device" />} />
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <NumberField
            label="Daily question target"
            hint="The Dashboard tracks today's count against this."
            value={prefs.dailyQuestionTarget}
            min={1}
            max={200}
            onChange={(v) => prefs.set('dailyQuestionTarget', v)}
          />
          <NumberField
            label="Weekly session target"
            hint="Weekly review compares actual vs. this."
            value={prefs.weeklySessionTarget}
            min={1}
            max={21}
            onChange={(v) => prefs.set('weeklySessionTarget', v)}
          />
          <SelectField
            label="Weekly review day"
            hint="Which weekday your review is due."
            value={String(prefs.weeklyReviewDay)}
            options={WEEKDAYS.map((d) => ({ value: String(d.value), label: d.label }))}
            onChange={(v) =>
              prefs.set('weeklyReviewDay', Number(v) as Preferences['weeklyReviewDay'])
            }
          />
        </CardBody>
      </Card>

      {/* --- Session defaults --------------------------------------------- */}
      <Card>
        <CardHeader
          title="Session defaults"
          aside={<span className="text-[11px] text-text-faint">applied on /session/new</span>}
        />
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SelectField
            label="Default subject"
            hint="Skip re-picking on every new session."
            value={prefs.defaultSubject ?? ''}
            options={[
              { value: '', label: 'Ask each time' },
              ...SUBJECTS.map((s) => ({ value: s, label: s }))
            ]}
            onChange={(v) => prefs.set('defaultSubject', v || null)}
          />
          <SelectField
            label="Target duration"
            value={String(prefs.defaultDurationMin)}
            options={TARGET_DURATIONS_MIN.map((m) => ({ value: String(m), label: `${m} min` }))}
            onChange={(v) => prefs.set('defaultDurationMin', Number(v) as DurationMin)}
          />
          <SelectField
            label="Question count"
            value={String(prefs.defaultQuestionCount)}
            options={QUESTION_COUNT_CHOICES.map((c) => ({
              value: String(c.value),
              label: c.label
            }))}
            onChange={(v) => prefs.set('defaultQuestionCount', Number(v))}
          />
        </CardBody>
      </Card>

      {/* --- Focus & density ---------------------------------------------- */}
      <Card>
        <CardHeader title="Focus & density" />
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <ToggleRow
              label="Compact rows"
              hint="Tighter row heights across Journal / Reattempts / Formulas."
              value={prefs.compactRows}
              onChange={(v) => prefs.set('compactRows', v)}
            />
            <ToggleRow
              label="Show T− countdown"
              hint="Days-until-exam pill in the sidebar and dashboard header."
              value={prefs.showCountdown}
              onChange={(v) => prefs.set('showCountdown', v)}
            />
            <ToggleRow
              label="Tactile feedback"
              hint={
                isNativeApp
                  ? 'Subtle taps for selections, completed work, and errors.'
                  : 'Used when HETU runs as the Android app.'
              }
              value={prefs.hapticsEnabled}
              onChange={(v) => prefs.set('hapticsEnabled', v)}
            />
          </div>
          <div className="flex flex-col gap-3">
            <SegmentField
              label="Appearance"
              hint="System follows this device's light or dark setting."
              value={prefs.colorTheme}
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' }
              ]}
              onChange={(v) => prefs.set('colorTheme', v as ThemeMode)}
            />
            <SegmentField
              label="Font scale"
              hint="Applies to the main content area."
              value={prefs.fontScale}
              options={[
                { value: 'small', label: 'Small' },
                { value: 'normal', label: 'Normal' },
                { value: 'large', label: 'Large' }
              ]}
              onChange={(v) => prefs.set('fontScale', v as FontScale)}
            />
          </div>
        </CardBody>
      </Card>

      {sandbox && (
        <Card>
          <CardHeader title="Backup reminder" />
          <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SegmentField
              label="Cadence"
              value={String(prefs.backupReminderDays)}
              options={[
                { value: '0', label: 'Never' },
                { value: '7', label: 'Weekly' },
                { value: '30', label: 'Monthly' }
              ]}
              onChange={(v) =>
                prefs.set('backupReminderDays', Number(v) as Preferences['backupReminderDays'])
              }
            />
            <div className="flex flex-col gap-1 sm:col-span-2">
              <span className="u-label">Last export</span>
              <div className="rounded border border-border bg-bg-overlay/40 px-3 py-2 text-[13px] text-text-muted">
                {prefs.lastBackupAt
                  ? `${formatDate(prefs.lastBackupAt.slice(0, 10), 'dd MMM yyyy')} · ${daysSinceBackup(prefs.lastBackupAt)} days ago`
                  : 'No export yet'}
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* --- Reset prefs -------------------------------------------------- */}
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] text-text-muted">
            Restore the built-in defaults for every preference on this page.
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              prefs.reset();
              pushToast('Preferences reset to defaults.', 'neutral');
            }}
          >
            <RotateCcw size={12} strokeWidth={1.75} className="mr-1" />
            Reset preferences
          </Button>
        </CardBody>
      </Card>

      <ProgressExportCard userId={userId} learnerName={profile?.name ?? 'HETU learner'} />

      {/* --- Profile (compact) -------------------------------------------- */}
      <ProfileCard
        profile={profile}
        sandbox={sandbox}
        userId={userId}
        onSave={updateProfile}
        onToast={pushToast}
      />

      {/* --- Notifications ------------------------------------------------ */}
      <BuddyNotificationsCard profile={profile} sandbox={sandbox} />
      <NotificationsCard profile={profile} sandbox={sandbox} />

      {/* --- Access requests (owner-only) --------------------------------- */}
      <AccessRequestsCard userId={userId} />

      {/* --- Invites ------------------------------------------------------ */}
      <InvitesCard userId={userId} sandbox={sandbox} />

      {/* --- Usage -------------------------------------------------------- */}
      {/* Local-only sandbox users need a manual backup because there is no server copy. */}
      {sandbox && <DataCard profile={profile} onBackup={() => prefs.markBackupNow()} />}

      {/* --- Session ------------------------------------------------------ */}
      <Card>
        <CardHeader title="Session" />
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] text-text-muted">
            Signing out wipes local Dexie storage on this device. Server data stays put.
          </p>
          <Button variant="danger" onClick={() => void onSignOut()} disabled={signingOut}>
            <LogOut size={14} className="mr-1" strokeWidth={1.75} />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </Button>
        </CardBody>
      </Card>
    </div>
  );

  // Reference to keep imports referenced (some are used only via child components below).
  void DEFAULT_PREFERENCES;
  void humanCountdown;
  void EXAM_DATE_DEFAULT;
}

/* ---------------- primitive editors ---------------- */

function PrefBadge({ label }: { label: string }) {
  return <Badge tone="neutral">{label}</Badge>;
}

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  onChange
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="u-label">{label}</span>
      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) =>
          onChange(Math.max(min, Math.min(max, Math.round(Number(e.target.value) || 0))))
        }
      />
      {hint && <p className="text-[11px] text-text-faint">{hint}</p>}
    </div>
  );
}

function SelectField({
  label,
  hint,
  value,
  options,
  onChange
}: {
  label: string;
  hint?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="u-label">{label}</span>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      {hint && <p className="text-[11px] text-text-faint">{hint}</p>}
    </div>
  );
}

function SegmentField({
  label,
  hint,
  value,
  options,
  onChange
}: {
  label: string;
  hint?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="u-label">{label}</span>
      <div className="inline-flex divide-x divide-border overflow-hidden rounded border border-border bg-bg-raised">
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              aria-pressed={on}
              className={cn(
                'flex-1 px-3 py-1.5 text-[12.5px] transition-colors',
                on
                  ? 'bg-accent-faint font-semibold text-accent'
                  : 'text-text-muted hover:bg-bg-overlay hover:text-text'
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {hint && <p className="text-[11px] text-text-faint">{hint}</p>}
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded border border-border/70 bg-bg-overlay/30 px-3 py-2">
      <div className="min-w-0">
        <p className="font-display text-[13px] font-semibold text-text">{label}</p>
        {hint && <p className="text-[11.5px] text-text-muted">{hint}</p>}
      </div>
      <button
        type="button"
        onClick={() => {
          haptic('selection');
          onChange(!value);
        }}
        aria-pressed={value}
        className={cn(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
          value ? 'bg-accent' : 'bg-bg-overlay'
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
            value ? 'translate-x-6' : 'translate-x-1'
          )}
        />
      </button>
    </div>
  );
}

/* ---------------- profile card ---------------- */

function ProfileCard({
  profile,
  sandbox,
  userId,
  onSave,
  onToast
}: {
  profile: UserRow | null;
  sandbox: boolean;
  userId: string | null;
  onSave: (patch: ProfilePatch) => Promise<{ error?: string }>;
  onToast: (m: string, tone?: 'success' | 'danger' | 'neutral') => void;
}) {
  const [form, setForm] = useState<UserRow | null>(profile);
  const [saving, setSaving] = useState<Set<keyof ProfilePatch>>(new Set());
  const [dirty, setDirty] = useState<Set<keyof ProfilePatch>>(new Set());

  useEffect(() => {
    setForm(profile);
    setDirty(new Set());
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save<K extends keyof ProfilePatch>(key: K, value: ProfilePatch[K]) {
    setSaving((s) => new Set(s).add(key));
    const { error } = await onSave({ [key]: value } as ProfilePatch);
    setSaving((s) => {
      const next = new Set(s);
      next.delete(key);
      return next;
    });
    if (error) {
      onToast(`Save failed: ${error}`, 'neutral');
      return;
    }
    setDirty((s) => {
      const next = new Set(s);
      next.delete(key);
      return next;
    });
    onToast(`Saved ${String(key).replace('_', ' ')}.`, 'success');
  }

  function mark<K extends keyof ProfilePatch>(key: K, v: ProfilePatch[K]) {
    if (!form) return;
    setForm({ ...form, [key]: v } as UserRow);
    setDirty((s) => new Set(s).add(key));
  }

  const dirtyCount = dirty.size;

  return (
    <Card>
      <CardHeader
        title="Profile"
        aside={
          <div className="flex items-center gap-2">
            <Badge tone={sandbox ? 'warn' : 'neutral'}>
              {sandbox ? 'sandbox' : supabaseConfigured ? 'signed in' : 'no auth'}
            </Badge>
            {dirtyCount > 0 && <Badge tone="warn">{dirtyCount} unsaved</Badge>}
          </div>
        }
      />
      <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="u-label" htmlFor="p-name">
            Name
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="p-name"
              value={form?.name ?? ''}
              onChange={(e) => mark('name', e.target.value)}
              maxLength={80}
              disabled={saving.has('name')}
            />
            {dirty.has('name') && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => void save('name', (form?.name ?? '').trim() || 'Aspirant')}
                disabled={saving.has('name')}
              >
                Save
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="u-label">Email</span>
          <div className="rounded border border-border bg-bg-overlay/40 px-3 py-2 text-[13px] text-text-muted">
            {form?.email ?? '—'}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="u-label" htmlFor="p-exam">
            Exam date
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="p-exam"
              type="date"
              value={form?.exam_date ?? ''}
              onChange={(e) => mark('exam_date', e.target.value)}
              disabled={saving.has('exam_date')}
            />
            {dirty.has('exam_date') && form?.exam_date && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => void save('exam_date', form.exam_date)}
                disabled={saving.has('exam_date')}
              >
                Save
              </Button>
            )}
          </div>
          <p className="text-[11px] text-text-faint">
            Drives the T− countdown and the Readiness runway bar.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label className="u-label" htmlFor="p-rank">
            Target AIR
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="p-rank"
              type="number"
              min={1}
              max={100000}
              value={form?.target_rank ?? ''}
              onChange={(e) =>
                mark('target_rank', Math.max(1, Math.round(Number(e.target.value) || 1)))
              }
              disabled={saving.has('target_rank')}
            />
            {dirty.has('target_rank') && form?.target_rank != null && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => void save('target_rank', form.target_rank)}
                disabled={saving.has('target_rank')}
              >
                Save
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="u-label" htmlFor="p-tz">
            Timezone
          </label>
          <div className="flex items-center gap-2">
            <Select
              id="p-tz"
              value={form?.timezone ?? 'Asia/Kolkata'}
              onChange={(e) => mark('timezone', e.target.value)}
              disabled={saving.has('timezone')}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </Select>
            {dirty.has('timezone') && form?.timezone && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => void save('timezone', form.timezone)}
                disabled={saving.has('timezone')}
              >
                Save
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <span className="u-label">Account id</span>
          <div className="u-num flex items-center gap-2 rounded border border-border bg-bg-overlay/40 px-3 py-2 text-[11.5px] text-text-muted">
            <span className="truncate">{userId ?? '—'}</span>
            {userId && <CopyButton value={userId} />}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function CopyButton({ value }: { value: string }) {
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
          // clipboard denied
        }
      }}
      aria-label="Copy"
      className="rounded p-1 text-text-faint hover:text-text"
    >
      {copied ? <Check size={12} strokeWidth={2} /> : <Copy size={12} strokeWidth={1.75} />}
    </button>
  );
}

/* ---------------- invites card ---------------- */

function InvitesCard({ userId, sandbox }: { userId: string | null; sandbox: boolean }) {
  const [invites, setInvites] = useState<InviteRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sandbox || !supabaseConfigured || !userId) {
      setInvites([]);
      return;
    }
    void reload();
  }, [userId, sandbox]); // eslint-disable-line react-hooks/exhaustive-deps

  async function reload() {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('invites')
      .select('*')
      .eq('issued_by', userId)
      .order('created_at', { ascending: false });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setError(null);
    setInvites((data as InviteRow[]) ?? []);
  }

  async function createInvite() {
    if (!userId) return;
    setCreating(true);
    const token = uuid().replace(/-/g, '').slice(0, 24);
    const expiresAt = new Date();
    expiresAt.setUTCDate(expiresAt.getUTCDate() + INVITE_TTL_DAYS);
    const { error } = await supabase.from('invites').insert({
      id: uuid(),
      token,
      issued_by: userId,
      expires_at: expiresAt.toISOString()
    });
    setCreating(false);
    if (error) {
      setError(error.message);
      return;
    }
    void reload();
  }

  if (sandbox || !supabaseConfigured) {
    return (
      <Card>
        <CardHeader title="Invites" />
        <CardBody>
          <p className="text-[12px] text-text-muted">
            Sign in with a real account to issue invites. In sandbox this section is disabled.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Invites"
        aside={
          <div className="flex items-center gap-2">
            {invites && (
              <span className="u-num text-[11px] text-text-faint">
                {invites.filter((i) => !i.used_by).length} unused
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={() => void reload()} disabled={loading}>
              <RefreshCcw size={12} strokeWidth={1.75} className="mr-1" />
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void createInvite()}
              disabled={creating}
            >
              <Plus size={12} strokeWidth={1.75} className="mr-1" />
              {creating ? 'Creating…' : 'New invite'}
            </Button>
          </div>
        }
      />
      {error && (
        <div className="border-b border-border/60 px-4 py-2 text-[12px] text-warn">{error}</div>
      )}
      {loading ? (
        <div className="px-4 py-4 text-[12px] text-text-faint">Loading…</div>
      ) : !invites || invites.length === 0 ? (
        <Empty
          title="No invites yet"
          hint={`Generate one to share the ${INVITE_TTL_DAYS}-day link with a buddy.`}
          className="border-0 py-8"
        />
      ) : (
        <ul className="divide-y divide-border">
          {invites.map((inv) => {
            const url = `${window.location.origin}/auth?invite=${inv.token}`;
            const expired = new Date(inv.expires_at) < new Date();
            const used = !!inv.used_by;
            return (
              <li
                key={inv.id}
                className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[12px]"
              >
                <span className="u-num truncate text-text-muted">{inv.token}</span>
                {used ? (
                  <Badge tone="success">used</Badge>
                ) : expired ? (
                  <Badge tone="warn">expired</Badge>
                ) : (
                  <Badge tone="neutral">active</Badge>
                )}
                <span className="text-text-faint">
                  expires {formatDate(inv.expires_at.slice(0, 10), 'dd MMM')}
                </span>
                {!used && !expired && (
                  <div className="ml-auto flex items-center gap-1.5">
                    <span className="max-w-[260px] truncate rounded border border-border bg-bg-overlay/40 px-2 py-1 text-[11px] text-text-muted">
                      {url}
                    </span>
                    <CopyButton value={url} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ---------------- data card ---------------- */

function ProgressExportCard({
  userId,
  learnerName
}: {
  userId: string | null;
  learnerName: string;
}) {
  const pushToast = useUiStore((state) => state.pushToast);
  const [downloading, setDownloading] = useState(false);

  async function onDownload() {
    if (!userId) return;
    setDownloading(true);
    try {
      const report = await collectProgressReport(userId, learnerName);
      downloadProgressReport(report);
      pushToast('Progress report saved to Downloads.', 'success');
    } catch (error) {
      pushToast(`Progress export failed: ${(error as Error).message}`, 'neutral');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Your progress"
        aside={<span className="text-[11px] text-text-faint">CSV report</span>}
      />
      <CardBody className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-3xl">
          <p className="font-display text-[14px] font-semibold text-text">
            One report for your complete preparation trail
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-text-muted">
            Includes sessions, journal outcomes, Planner, PYQs, patterns, re-attempts, weekly
            reviews, heatmap, calibration, readiness, syllabus coverage, trigger drills, formulas,
            focus, and subject-level totals. Opens in Excel or Google Sheets.
          </p>
          <div
            className="mt-3 inline-grid grid-cols-3 divide-x divide-border overflow-hidden rounded border border-border bg-bg-overlay/40 text-[10.5px]"
            aria-label="Report scope"
          >
            <span className="px-2.5 py-1.5 text-text-muted">
              <strong className="u-num mr-1 text-text">All</strong> areas
            </span>
            <span className="px-2.5 py-1.5 text-text-muted">
              <strong className="u-num mr-1 text-text">All</strong> subjects
            </span>
            <span className="px-2.5 py-1.5 text-text-muted">
              <strong className="u-num mr-1 text-text">CSV</strong> format
            </span>
          </div>
        </div>
        <Button
          variant="primary"
          onClick={() => void onDownload()}
          disabled={!userId || downloading}
        >
          <Download size={14} strokeWidth={1.75} className="mr-1" />
          {downloading ? 'Preparing report…' : 'Download progress'}
        </Button>
      </CardBody>
    </Card>
  );
}

function DataCard({ profile, onBackup }: { profile: UserRow | null; onBackup: () => void }) {
  const pushToast = useUiStore((s) => s.pushToast);
  const [busy, setBusy] = useState<'export' | 'import' | 'clear' | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const backupSummary = useMemo(() => `backup v${BACKUP_VERSION}`, []);

  async function onExport() {
    setBusy('export');
    try {
      const env = await exportAll(profile);
      downloadEnvelope(env);
      onBackup();
      pushToast('Backup saved to Downloads.', 'success');
    } catch (err) {
      pushToast(`Export failed: ${(err as Error).message}`, 'neutral');
    } finally {
      setBusy(null);
    }
  }

  async function onImportPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('import');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      if (!isBackupEnvelope(parsed)) throw new Error('not a valid backup');
      const report = await importEnvelope(parsed);
      const total = report.reduce((s, r) => s + r.added, 0);
      pushToast(`Imported ${total} rows across ${report.length} tables.`, 'success');
    } catch (err) {
      pushToast(`Import failed: ${(err as Error).message}`, 'neutral');
    } finally {
      setBusy(null);
    }
  }

  async function onClear() {
    setBusy('clear');
    try {
      await wipeLocalState();
      pushToast('Local storage wiped. Server data untouched.', 'neutral');
    } catch (err) {
      pushToast(`Clear failed: ${(err as Error).message}`, 'neutral');
    } finally {
      setBusy(null);
      setConfirmClear(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Backup & data"
        aside={<span className="text-[11px] text-text-faint">{backupSummary}</span>}
      />
      <CardBody className="flex flex-col gap-3">
        <div className="rounded border border-border/70 bg-bg-overlay/40 px-3 py-2 text-[12px] text-text-muted">
          <p>
            Take a copy of your journal off the app, put an old backup back in, or clear this
            device's cache. Server data (Supabase) is untouched by any of these unless you sign out.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <div>
            <p className="font-display text-[13px] font-semibold text-text">
              1 · Download a backup
            </p>
            <p className="text-[12px] text-text-muted">
              Saves a JSON file of every question, session, pattern, and note on this device to your
              Downloads folder. Use it as a safety net or to move to a new browser. Buddy-shared
              rows are excluded.
            </p>
          </div>
          <Button variant="primary" onClick={() => void onExport()} disabled={busy !== null}>
            <Download size={14} strokeWidth={1.75} className="mr-1" />
            {busy === 'export' ? 'Preparing…' : 'Download backup'}
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <div>
            <p className="font-display text-[13px] font-semibold text-text">
              2 · Restore from a backup file
            </p>
            <p className="text-[12px] text-text-muted">
              Reads a JSON backup and merges it with what's here now. Rows match by id — anything
              you've edited since the backup stays as you left it. Nothing is deleted.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              onChange={onImportPick}
              className="hidden"
              disabled={busy !== null}
            />
            <Button
              variant="ghost"
              onClick={() => fileRef.current?.click()}
              disabled={busy !== null}
            >
              <Upload size={14} strokeWidth={1.75} className="mr-1" />
              {busy === 'import' ? 'Merging…' : 'Choose backup file'}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <div>
            <p className="font-display text-[13px] font-semibold text-text">
              3 · Clear this device's local cache
            </p>
            <p className="text-[12px] text-text-muted">
              Rarely needed. Deletes the offline database on THIS device only; your Supabase server
              data stays intact and re-syncs on next open. Use if a stuck row is misbehaving. In
              sandbox mode (no sign-in), everything is lost — download a backup first.
            </p>
          </div>
          {confirmClear ? (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmClear(false)}
                disabled={busy !== null}
              >
                <X size={12} strokeWidth={1.75} className="mr-1" /> Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => void onClear()}
                disabled={busy !== null}
              >
                <Trash2 size={12} strokeWidth={1.75} className="mr-1" />
                {busy === 'clear' ? 'Wiping…' : 'Confirm wipe'}
              </Button>
            </div>
          ) : (
            <Button variant="danger" onClick={() => setConfirmClear(true)} disabled={busy !== null}>
              <Trash2 size={14} strokeWidth={1.75} className="mr-1" />
              Wipe local storage
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
