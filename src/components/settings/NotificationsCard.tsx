// Settings is the single control surface for the optional Telegram digest.
// The bot token is server-only; users connect a private chat through a
// short-lived link, then control delivery time, timezone, and daily on/off.
import { useCallback, useEffect, useState } from 'react';
import { Bell, Bot, CheckCircle2, Clock3, Link2, RefreshCcw, Send, Unlink } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import NotificationTimeEditor from '@/components/settings/NotificationTimeEditor';
import { TIMEZONES } from '@/lib/constants';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useAuthStore, type ProfilePatch } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import type { TelegramSubscriptionRow, UserRow } from '@/types';

interface Props {
  profile: UserRow | null;
  sandbox: boolean;
}

// Telegram usernames are public identifiers, so the production bot is a safe
// fallback when a preview/local build has not supplied the optional env value.
const botUsername = String(import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'Gate_prep_reminder_bot')
  .trim()
  .replace(/^@/, '');

export default function NotificationsCard({ profile, sandbox }: Props) {
  const pushToast = useUiStore((state) => state.pushToast);
  const [telegram, setTelegram] = useState<TelegramSubscriptionRow | null>(null);
  const [loadingTelegram, setLoadingTelegram] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectUrl, setConnectUrl] = useState<string | null>(null);
  const [awaitingConnection, setAwaitingConnection] = useState(false);
  const [sending, setSending] = useState(false);

  const loadTelegram = useCallback(async () => {
    if (!profile || sandbox || !supabaseConfigured) return;
    setLoadingTelegram(true);
    const { data, error } = await supabase
      .from('telegram_subscriptions')
      .select('*')
      .eq('user_id', profile.id)
      .maybeSingle();
    setLoadingTelegram(false);
    if (error) {
      pushToast(`Could not read Telegram status: ${error.message}`, 'neutral');
      return;
    }
    const next = (data as TelegramSubscriptionRow | null) ?? null;
    setTelegram(next);
    if (next?.connected_at) {
      setAwaitingConnection(false);
      setConnectUrl(null);
    }
  }, [profile, pushToast, sandbox]);

  useEffect(() => {
    void loadTelegram();
    const onFocus = () => void loadTelegram();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadTelegram]);

  useEffect(() => {
    if (!awaitingConnection) return;
    const poll = window.setInterval(() => void loadTelegram(), 3000);
    const stop = window.setTimeout(() => setAwaitingConnection(false), 120_000);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(stop);
    };
  }, [awaitingConnection, loadTelegram]);

  if (!profile) return null;

  const connected = Boolean(telegram?.chat_id && telegram.connected_at);
  const enabled = connected && Boolean(telegram?.enabled);
  const connectedAccount = telegram?.chat_username
    ? `@${telegram.chat_username}`
    : connected
      ? 'Private Telegram chat'
      : sandbox || !supabaseConfigured
        ? 'Sandbox mode (time saved locally)'
        : 'Not connected';

  async function patchProfile(patch: ProfilePatch): Promise<boolean> {
    if (!profile) return false;
    const res = await useAuthStore.getState().updateProfile(patch);
    if (res.error) {
      pushToast(res.error, 'neutral');
      return false;
    }
    return true;
  }

  async function setTelegramEnabled(value: boolean) {
    if (!connected) {
      pushToast('Connect Telegram before turning on daily delivery.', 'neutral');
      return;
    }
    const { error } = await supabase.rpc('set_telegram_digest_enabled', {
      wants_enabled: value
    });
    if (error) {
      pushToast(error.message, 'neutral');
      return;
    }
    await loadTelegram();
    pushToast(
      value ? 'Daily Telegram notification on.' : 'Daily Telegram notification off.',
      'success'
    );
  }

  async function beginConnection() {
    if (sandbox || !supabaseConfigured) {
      pushToast('Telegram connection requires connecting to Supabase backend.', 'neutral');
      return;
    }
    setConnecting(true);
    const { data, error } = await supabase.rpc('begin_telegram_connection');
    setConnecting(false);
    if (error) {
      pushToast(error.message, 'neutral');
      return;
    }
    const row = ((data as Array<{ token: string; expires_at: string }> | null) ?? [])[0];
    if (!row?.token) {
      pushToast('Could not create a Telegram connection link.', 'neutral');
      return;
    }
    setConnectUrl(`https://t.me/${botUsername}?start=${encodeURIComponent(row.token)}`);
    setAwaitingConnection(true);
  }

  async function disconnectTelegram() {
    const { error } = await supabase.rpc('disconnect_telegram');
    if (error) {
      pushToast(error.message, 'neutral');
      return;
    }
    setTelegram(null);
    setConnectUrl(null);
    setAwaitingConnection(false);
    pushToast('Telegram disconnected.', 'success');
  }

  async function saveTime(hour: number, minute: number): Promise<boolean> {
    if (
      await patchProfile({
        digest_hour_local: hour,
        digest_minute_local: minute
      })
    ) {
      const formatted = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      pushToast(`Delivery time saved as ${formatted}.`, 'success');
      return true;
    }
    return false;
  }

  async function saveTimezone(timezone: string) {
    if (await patchProfile({ timezone })) {
      pushToast('Notification timezone saved.', 'success');
    }
  }

  async function saveEmailBackup(value: boolean) {
    if (await patchProfile({ digest_email_enabled: value })) {
      pushToast(value ? 'Email backup on.' : 'Email backup off.', 'success');
    }
  }

  async function sendTest() {
    if (!profile || !connected || !telegram?.enabled) return;
    setSending(true);
    const { data, error } = await supabase.functions.invoke('daily-digest', {
      body: { user_id: profile.id, force: true, test: true, channel: 'telegram' }
    });
    setSending(false);
    if (error) {
      pushToast(error.message, 'neutral');
      return;
    }
    const report = ((
      data as {
        report?: Array<{ telegram_ok?: boolean; telegram_err?: string }>;
      }
    )?.report ?? [])[0];
    if (report?.telegram_ok) {
      pushToast('Telegram test delivered.', 'success');
      await loadTelegram();
      return;
    }
    pushToast(report?.telegram_err ?? 'Telegram test was not delivered.', 'neutral');
  }

  return (
    <Card id="digest">
      <CardHeader
        title="Telegram notifications"
        aside={
          <span
            className={cn(
              'rounded-full px-2.5 py-1 text-[11px] font-semibold',
              enabled ? 'bg-success/10 text-success' : 'bg-bg-overlay text-text-faint'
            )}
          >
            {enabled ? 'Daily delivery on' : 'Daily delivery off'}
          </span>
        }
      />
      <CardBody className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <Bell size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-accent" />
          <p className="text-[12.5px] leading-relaxed text-text-muted">
            Configure everything here. On days with a recorded study plan, HETU sends one private
            Telegram message at your chosen local time. The bot token stays on the server and is
            never entered in the website.
          </p>
        </div>

        <section className="flex items-center justify-between gap-4 rounded border border-accent/25 bg-accent-faint/45 px-4 py-3">
          <div className="min-w-0">
            <p className="font-display text-[14px] font-semibold text-text">
              Daily Telegram notification
            </p>
            <p className="mt-0.5 text-[11.5px] text-text-muted">
              {connected ? connectedAccount : 'Connect your Telegram account first.'}
            </p>
          </div>
          <MasterToggle
            checked={enabled}
            disabled={!connected}
            onChange={(value) => void setTelegramEnabled(value)}
          />
        </section>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DetailField label="Telegram bot" icon={<Bot size={13} strokeWidth={1.75} />}>
            <a
              href={`https://t.me/${botUsername}`}
              target="_blank"
              rel="noreferrer"
              className="text-[13px] font-medium text-accent hover:underline"
            >
              @{botUsername}
            </a>
          </DetailField>

          <DetailField
            label="Connected account"
            icon={
              connected ? (
                <CheckCircle2 size={13} strokeWidth={1.75} className="text-success" />
              ) : (
                <Link2 size={13} strokeWidth={1.75} />
              )
            }
          >
            <p className="text-[13px] font-medium text-text">{connectedAccount}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {!connected && !connectUrl && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void beginConnection()}
                  disabled={connecting}
                >
                  <Link2 size={12} strokeWidth={1.75} className="mr-1" />
                  {connecting ? 'Preparing…' : 'Connect Telegram'}
                </Button>
              )}
              {!connected && connectUrl && (
                <Button
                  size="sm"
                  onClick={() => window.open(connectUrl, '_blank', 'noopener,noreferrer')}
                >
                  <Send size={12} strokeWidth={1.75} className="mr-1" />
                  Open Telegram
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void loadTelegram()}
                disabled={loadingTelegram}
                aria-label="Refresh Telegram connection"
              >
                <RefreshCcw size={12} strokeWidth={1.75} className="mr-1" />
                Refresh
              </Button>
              {connected && (
                <Button variant="ghost" size="sm" onClick={() => void disconnectTelegram()}>
                  <Unlink size={12} strokeWidth={1.75} className="mr-1" />
                  Disconnect
                </Button>
              )}
            </div>
            {awaitingConnection && (
              <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
                Tap Start in Telegram. This page checks the connection automatically for two
                minutes.
              </p>
            )}
          </DetailField>

          <DetailField label="Daily delivery time" icon={<Clock3 size={13} strokeWidth={1.75} />}>
            <NotificationTimeEditor
              idPrefix="telegram-delivery"
              label="Daily Telegram delivery"
              hour={profile.digest_hour_local}
              minute={profile.digest_minute_local ?? 0}
              onSave={saveTime}
            />
            <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
              Sends at{' '}
              <span className="font-mono font-semibold text-text">
                {String(profile.digest_hour_local).padStart(2, '0')}:
                {String(profile.digest_minute_local ?? 0).padStart(2, '0')}
              </span>{' '}
              in your notification timezone.
            </p>
          </DetailField>

          <DetailField label="Notification timezone" icon={<Clock3 size={13} strokeWidth={1.75} />}>
            <select
              id="telegram-timezone"
              aria-label="Telegram notification timezone"
              value={profile.timezone}
              onChange={(event) => void saveTimezone(event.target.value)}
              className="block h-10 w-full rounded border border-border bg-bg-raised px-3 text-[13px] text-text focus:border-accent focus:shadow-[0_0_0_3px_theme(colors.accent.faint)] focus:outline-none"
            >
              {TIMEZONES.map((timezone) => (
                <option key={timezone.value} value={timezone.value}>
                  {timezone.label}
                </option>
              ))}
            </select>
          </DetailField>
        </div>

        <div className="rounded border border-border/70 bg-bg-overlay/35 px-3 py-2.5">
          <p className="u-label">Daily message contains</p>
          <p className="mt-1 text-[12px] leading-relaxed text-text-muted">
            Today&apos;s study sessions, one short focus line, and due re-attempts grouped by
            subject. Empty planning days stay silent.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <label className="flex items-center gap-2 text-[12px] text-text-muted">
            <input
              type="checkbox"
              checked={profile.digest_email_enabled}
              onChange={(event) => void saveEmailBackup(event.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            Also send an email backup
          </label>
          <Button size="sm" onClick={() => void sendTest()} disabled={!enabled || sending}>
            <Send size={12} strokeWidth={1.75} className="mr-1" />
            {sending ? 'Sending…' : 'Send Telegram test'}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function DetailField({
  label,
  icon,
  children
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-border/70 bg-bg-overlay/25 px-3 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-text-faint">
        {icon}
        <p className="u-label">{label}</p>
      </div>
      {children}
    </div>
  );
}

function MasterToggle({
  checked,
  disabled,
  onChange
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="Daily Telegram notification"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-40',
        checked ? 'bg-success' : 'bg-text-faint/45'
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  );
}
