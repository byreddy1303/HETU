// /forgot-pin — Request a PIN reset email.
// User enters their username. Server-side, we look up the linked email and
// send a Supabase recovery link (via our own Resend template). Response is
// intentionally identical whether or not the username exists — no
// enumeration.
import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { useAuth } from '@/hooks/useAuth';
import { supabaseConfigured } from '@/lib/supabase';
import { EXAM_DATE_DEFAULT } from '@/lib/constants';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { requestPinReset } from '@/lib/edge';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import Brand from '@/components/shared/Brand';
import ThemeToggle from '@/components/shared/ThemeToggle';

type SubmitState = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'error'; message: string };
const USERNAME_RE = /^[a-z0-9_]{3,32}$/;

export default function ForgotPin() {
  const { status } = useAuth();
  const [username, setUsername] = useState('');
  const [state, setState] = useState<SubmitState>({ kind: 'idle' });

  if (status === 'signed_in') return <Navigate to="/" replace />;

  const cleanedUsername = username.trim().toLowerCase();
  const canSubmit = state.kind !== 'sending' && USERNAME_RE.test(cleanedUsername);
  const daysLeft = differenceInCalendarDays(parseISO(EXAM_DATE_DEFAULT), new Date());

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setState({ kind: 'sending' });
    const res = await requestPinReset({ username: cleanedUsername });
    if ('ok' in res && res.ok) {
      setState({ kind: 'sent' });
      return;
    }
    setState({ kind: 'error', message: res.error });
  }

  return (
    <div className="native-auth-page relative flex min-h-dvh flex-col bg-bg">
      <header className="flex items-center justify-between px-6 py-4">
        <Brand size="sm" />
        <div className="flex items-center gap-3">
          <Link to="/auth" className="u-label hover:text-text">
            Back to sign in
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          className="native-auth-panel u-panel relative w-full max-w-[400px] p-8"
        >
          <div className="u-margin-line">
            <h1 className="font-display text-[24px] font-bold leading-tight tracking-tight text-text">
              Reset your PIN.
            </h1>
            <p className="mt-2 text-[13px] leading-relaxed text-text-muted">
              Enter your username. If it matches an account, we'll send a reset link to the email
              on file.
            </p>
          </div>

          <div className="u-rule my-6" />

          {!supabaseConfigured ? (
            <p className="rounded border border-warn/40 bg-warn/5 px-3 py-3 text-[12.5px] text-warn">
              Supabase env not configured.
            </p>
          ) : state.kind === 'sent' ? (
            <div className="rounded border border-success/30 bg-success/5 px-4 py-4">
              <p className="font-display text-[15px] font-semibold text-success">
                Check your inbox.
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
                If the username exists, we've sent a reset link to the email you signed up with.
                The link expires in 1 hour.
              </p>
              <Link
                to="/auth"
                className="mt-4 inline-block text-[12px] font-medium text-accent hover:underline"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate>
              <label htmlFor="fp-username" className="u-label block">
                Username
              </label>
              <Input
                id="fp-username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                placeholder="your_handle"
                className="mt-2"
                disabled={state.kind === 'sending'}
              />
              <Button
                type="submit"
                variant="primary"
                disabled={!canSubmit}
                className="mt-4 w-full"
              >
                {state.kind === 'sending' ? 'Sending…' : 'Send reset link'}
              </Button>
              <div className="mt-3 min-h-[18px]" aria-live="polite">
                {state.kind === 'error' && (
                  <p className="text-xs font-medium text-danger">{state.message}</p>
                )}
              </div>
            </form>
          )}
        </motion.div>
      </main>

      <footer className="flex items-center justify-between px-6 py-4">
        <span className="u-label">GATE CS · {EXAM_DATE_DEFAULT}</span>
        <span className="u-num text-xs text-text-muted">
          T−{daysLeft}
          <span className="text-text-faint">d</span>
        </span>
      </footer>
    </div>
  );
}
