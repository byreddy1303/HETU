// First-run welcome overlay. Shown exactly once per account — the "seen"
// timestamp lives on public.users so it survives sign-out (Dexie is wiped
// on sign-out for tenant isolation).
//
// Explains the loop to a stranger in four calm paper slides. No emojis, no
// hype, no counters, no dark patterns.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

/** Local fallback key for the sandbox / offline-only case. */
const DEXIE_KEY = 'welcome_seen_at';

interface Slide {
  eyebrow: string;
  title: string;
  body: string;
  hint?: string;
}

const SLIDES: Slide[] = [
  {
    eyebrow: 'welcome',
    title: 'This is a mistake-surface tool.',
    body: 'Every question you solve becomes structured data — outcome, pattern, trigger, root cause. Over weeks, the shape of what still trips you up becomes visible enough to fix.',
    hint: 'Not a leaderboard. Not a study planner. A quiet notebook that remembers.'
  },
  {
    eyebrow: 'the loop',
    title: 'Session → tag → re-attempt.',
    body: 'Start a timed session. Tag every question in under 30 seconds with 4 keystrokes. Anything wrong or slow schedules itself for re-attempt at day 3, day 10, and day 30.',
    hint: 'The queue on the Dashboard tells you what to revisit today.'
  },
  {
    eyebrow: 'weekly',
    title: 'One fix per week.',
    body: 'On Sundays, look at seven days of tags, name the upstream root cause, and commit to one concrete fix. Your own evidence sets the next move.',
    hint: 'Skipping a Sunday is silent. There are no streaks to break.'
  },
  {
    eyebrow: 'ready',
    title: 'First move.',
    body: 'Create a session, log 5 real questions from a PYQ, tag each honestly. That is the whole practice. The dashboard starts earning its keep from there.'
  }
];

export default function WelcomeOverlay() {
  const [visible, setVisible] = useState(false);
  const [idx, setIdx] = useState(0);
  const dismissed = useRef(false);
  const profile = useAuthStore((s) => s.profile);
  const sandbox = useAuthStore((s) => s.sandbox);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      // The device marker closes the navigation race while the account marker
      // keeps the walkthrough dismissed on other signed-in devices.
      try {
        const row = await db.meta.get(DEXIE_KEY);
        if (cancelled || dismissed.current || row?.value) return;
      } catch {
        // If Dexie fails, fall through to the account check.
      }
      if (sandbox || !supabaseConfigured) {
        if (!cancelled && !dismissed.current) setVisible(true);
        return;
      }
      if (!profile) return;
      if (!cancelled && !dismissed.current && !profile.welcome_seen_at) setVisible(true);
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [profile, sandbox]);

  const dismiss = useCallback(async () => {
    dismissed.current = true;
    const stamp = new Date().toISOString();
    try {
      await db.meta.put({ key: DEXIE_KEY, value: stamp });
    } catch {
      // Ignore device-marker errors; the account marker may still succeed.
    }
    setVisible(false);
    if (sandbox || !supabaseConfigured) return;
    if (!profile) return;
    const { error } = await supabase
      .from('users')
      .update({ welcome_seen_at: stamp })
      .eq('id', profile.id);
    if (!error) void refreshProfile();
  }, [profile, refreshProfile, sandbox]);

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void dismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dismiss, visible]);

  if (!visible) return null;

  const slide = SLIDES[idx];
  const isLast = idx === SLIDES.length - 1;

  return (
    <div
      className="native-welcome-overlay latency-overlay-enter fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      <div className="native-welcome-panel latency-dialog-enter u-panel relative w-full max-w-[520px] overflow-hidden">
        <button
          type="button"
          onClick={() => void dismiss()}
          aria-label="Skip walkthrough"
          className="absolute right-3 top-3 z-10 rounded p-1.5 text-text-faint hover:bg-bg-overlay hover:text-text"
        >
          <X size={14} strokeWidth={1.75} />
        </button>

        <div className="u-margin-line px-7 py-7">
          <div key={slide.title} className="latency-welcome-slide">
            <p className="u-label text-accent">{slide.eyebrow}</p>
            <h2
              id="welcome-title"
              className="mt-2 font-display text-[24px] font-bold leading-tight tracking-tight text-text"
            >
              {slide.title}
            </h2>
            <p className="mt-3 text-[14px] leading-relaxed text-text-muted">{slide.body}</p>
            {slide.hint && (
              <p className="mt-2 text-[12.5px] leading-relaxed text-text-faint">{slide.hint}</p>
            )}
          </div>

          <div className="mt-7 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              {SLIDES.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === idx ? 'w-6 bg-accent' : 'w-1.5 bg-border'
                  )}
                  aria-hidden
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {idx > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setIdx((i) => Math.max(0, i - 1))}>
                  Back
                </Button>
              )}
              {isLast ? (
                <Button variant="primary" size="sm" onClick={() => void dismiss()}>
                  Open my dashboard
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setIdx((i) => Math.min(SLIDES.length - 1, i + 1))}
                >
                  Next
                  <ArrowRight size={12} strokeWidth={2} className="ml-1" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
