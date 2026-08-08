import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, CheckCircle2, Laptop, LockKeyhole, Smartphone } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  disableBuddyNotifications,
  enableBuddyNotifications,
  getBuddyNotificationState,
  type BuddyNotificationState
} from '@/lib/buddyNotifications';
import { isNativeApp } from '@/lib/native';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import type { UserRow } from '@/types';
import { cn } from '@/lib/utils';

interface Props {
  profile: UserRow | null;
  sandbox: boolean;
}

function isIosBrowser(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandaloneWebApp(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

function deviceLabel(state: BuddyNotificationState | null): string {
  if (state?.platform === 'android') return 'This Android app';
  if (state?.platform === 'ios') return 'This iPhone app';
  return 'This browser';
}

export default function BuddyNotificationsCard({ profile, sandbox }: Props) {
  const pushToast = useUiStore((state) => state.pushToast);
  const [state, setState] = useState<BuddyNotificationState | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!profile || sandbox) return;
    setState(await getBuddyNotificationState());
  }, [profile, sandbox]);

  useEffect(() => {
    void refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refresh]);

  if (!profile) return null;

  const enabled = Boolean(state?.registered);
  const permissionBlocked = state?.permission === 'denied';
  const iosNeedsInstall = !isNativeApp && isIosBrowser() && !isStandaloneWebApp();

  async function toggle() {
    if (sandbox) {
      pushToast('Buddy notifications require a signed-in account.', 'neutral');
      return;
    }
    setBusy(true);
    const result = enabled
      ? await disableBuddyNotifications()
      : await enableBuddyNotifications();
    setBusy(false);
    await refresh();
    if (!result.ok) {
      pushToast(result.error ?? 'Could not change notification access.', 'neutral');
      return;
    }
    pushToast(
      enabled
        ? `Buddy alerts are off on ${deviceLabel(state).toLowerCase()}.`
        : `Buddy alerts are on for ${deviceLabel(state).toLowerCase()}.`,
      'success'
    );
  }

  async function setPreview(value: boolean) {
    const result = await useAuthStore
      .getState()
      .updateProfile({ buddy_notification_preview_enabled: value });
    if (result.error) {
      pushToast(result.error, 'neutral');
      return;
    }
    pushToast(value ? 'Message previews are visible.' : 'Message previews are private.', 'success');
  }

  const statusLabel = sandbox
    ? 'Sign in required'
    : enabled
      ? 'Live on this device'
      : permissionBlocked
        ? 'Blocked by device'
        : 'Off on this device';

  return (
    <Card id="buddy-notifications">
      <CardHeader
        title="Buddy message alerts"
        aside={
          <span
            className={cn(
              'rounded-full px-2.5 py-1 text-[11px] font-semibold',
              enabled ? 'bg-success/10 text-success' : 'bg-bg-overlay text-text-faint'
            )}
          >
            {statusLabel}
          </span>
        }
      />
      <CardBody className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <Bell size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-accent" />
          <p className="text-[12.5px] leading-relaxed text-text-muted">
            Get a phone or desktop alert when a buddy sends a message, even while AIR Journal is
            closed. Alerts stay quiet on a device that already has that chat open.
          </p>
        </div>

        <section className="grid gap-3 rounded border border-accent/25 bg-accent-faint/45 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-raised text-accent shadow-sm">
              {isNativeApp ? (
                <Smartphone size={15} strokeWidth={1.75} />
              ) : (
                <Laptop size={15} strokeWidth={1.75} />
              )}
            </span>
            <div className="min-w-0">
              <p className="font-display text-[14px] font-semibold text-text">
                {deviceLabel(state)}
              </p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-text-muted">
                {enabled
                  ? 'Registered and ready for new Buddy messages.'
                  : permissionBlocked
                    ? 'Allow notifications in system or browser settings, then return here.'
                    : iosNeedsInstall
                      ? 'On iPhone or iPad, add AIR Journal to the Home Screen, reopen it, then enable alerts.'
                      : 'Enable once on every phone or computer where you want alerts.'}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant={enabled ? 'secondary' : 'primary'}
            onClick={() => void toggle()}
            disabled={busy || sandbox || state?.supported === false}
          >
            {enabled ? <BellOff size={12} className="mr-1" /> : <Bell size={12} className="mr-1" />}
            {busy ? 'Updating…' : enabled ? 'Turn off here' : 'Enable alerts'}
          </Button>
        </section>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" aria-label="Buddy alert delivery path">
          <DeliveryStep icon={<CheckCircle2 size={13} />} label="Buddy sends" detail="Saved first" />
          <DeliveryStep icon={<LockKeyhole size={13} />} label="Private route" detail="Your devices only" />
          <DeliveryStep icon={<Bell size={13} />} label="Phone + desktop" detail="Fast retry included" />
        </div>

        <label className="flex items-start justify-between gap-4 border-t border-border pt-3">
          <span>
            <span className="block text-[12.5px] font-medium text-text">Show message preview</span>
            <span className="mt-0.5 block text-[11.5px] leading-relaxed text-text-muted">
              Turn this off to show only who sent the message on lock screens.
            </span>
          </span>
          <input
            type="checkbox"
            checked={profile.buddy_notification_preview_enabled}
            onChange={(event) => void setPreview(event.target.checked)}
            disabled={sandbox}
            className="mt-1 h-4 w-4 shrink-0 accent-accent"
          />
        </label>
      </CardBody>
    </Card>
  );
}

function DeliveryStep({
  icon,
  label,
  detail
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded border border-border/70 bg-bg-overlay/25 px-3 py-2.5">
      <span className="shrink-0 text-accent">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-[11.5px] font-semibold text-text">{label}</span>
        <span className="block truncate text-[10.5px] text-text-faint">{detail}</span>
      </span>
    </div>
  );
}
