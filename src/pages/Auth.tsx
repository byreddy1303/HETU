// /auth — Username + PIN login.
// The signup + Google + magic-link paths are gone; the only entry into an
// account is username + PIN. Outsiders get pushed to /request-access, and
// the very first user (bootstrap) can jump to /signup with no invite token.
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { motion } from 'motion/react';
import { useAuthStore } from '@/stores/auth';
import { useAuth } from '@/hooks/useAuth';
import { supabaseConfigured } from '@/lib/supabase';
import { EXAM_DATE_DEFAULT } from '@/lib/constants';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import PinInput from '@/components/auth/PinInput';
import Brand, { BrandMark } from '@/components/shared/Brand';
import ThemeToggle from '@/components/shared/ThemeToggle';

type SubmitState = { kind: 'idle' } | { kind: 'sending' } | { kind: 'error'; message: string };

export default function Auth() {
  const { status } = useAuth();
  const signIn = useAuthStore((s) => s.signIn);
  const enterSandbox = useAuthStore((s) => s.enterSandbox);
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [state, setState] = useState<SubmitState>({ kind: 'idle' });

  if (status === 'signed_in') return <Navigate to="/" replace />;

  const daysLeft = differenceInCalendarDays(parseISO(EXAM_DATE_DEFAULT), new Date());
  const cleanedUsername = username.trim().toLowerCase();
  const canSubmit =
    state.kind !== 'sending' &&
    /^[a-z0-9_]{3,32}$/.test(cleanedUsername) &&
    /^\d{6}$/.test(pin);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setState({ kind: 'sending' });
    const { error } = await signIn(cleanedUsername, pin);
    if (error) {
      setState({ kind: 'error', message: error });
      setPin('');
      return;
    }
    navigate('/', { replace: true });
  }

  return (
    <div className="native-auth-page relative flex min-h-dvh flex-col bg-bg">
      <header className="flex items-center justify-between px-6 py-4">
        <Brand size="sm" />
        <div className="flex items-center gap-3">
          <span className="u-label">invite-only</span>
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
          <span className="u-stamp absolute right-6 top-7">gate 2027</span>

          <div className="u-margin-line flex items-center gap-3">
            <BrandMark className="h-14 w-14" />
            <div>
              <h1 className="font-display text-[38px] font-bold leading-none tracking-tight">
                AIR<span className="text-accent">.</span>
              </h1>
              <p className="u-label mt-2">the rank notebook</p>
            </div>
          </div>
          <div className="pl-6">
            <p className="mt-4 text-[13.5px] leading-relaxed text-text-muted">
              Sign in with your{' '}
              <span className="u-highlight font-medium text-text">username and 6-digit PIN</span>.
            </p>
          </div>

          <div className="u-rule my-6" />

          {supabaseConfigured ? (
            <>
              <form onSubmit={onSubmit} noValidate>
                <label htmlFor="username" className="u-label block">
                  Username
                </label>
                <Input
                  id="username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="your_handle"
                  className="mt-2"
                  disabled={state.kind === 'sending'}
                />

                <label htmlFor="pin" className="u-label mt-4 block">
                  6-digit PIN
                </label>
                <div className="mt-2">
                  <PinInput
                    id="pin"
                    value={pin}
                    onChange={setPin}
                    disabled={state.kind === 'sending'}
                    autoFocus={false}
                  />
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  disabled={!canSubmit}
                  className="mt-6 w-full"
                >
                  {state.kind === 'sending' ? 'Signing in…' : 'Sign in'}
                </Button>
              </form>

              <div className="mt-4 min-h-[18px]" aria-live="polite">
                {state.kind === 'error' && (
                  <p className="text-xs font-medium text-danger">{state.message}</p>
                )}
              </div>

              <div className="mt-6 flex flex-col gap-2 border-t border-border pt-5 text-[12.5px]">
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Forgot your PIN?</span>
                  <Link to="/forgot-pin" className="font-medium text-accent hover:underline">
                    Reset with email
                  </Link>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">No invite yet?</span>
                  <Link to="/request-access" className="font-medium text-accent hover:underline">
                    Ask for one
                  </Link>
                </div>
              </div>
            </>
          ) : (
            <div>
              <p className="text-[13px] leading-relaxed text-text-muted">
                Supabase is not configured. Fill{' '}
                <span className="u-num text-xs text-text">.env.local</span> to enable sign-in.
              </p>
              {import.meta.env.DEV && (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => void enterSandbox()}
                  className="mt-4 w-full"
                >
                  Enter local sandbox
                </Button>
              )}
            </div>
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
