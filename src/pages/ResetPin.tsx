// /reset-pin — Land here from a recovery email. The Supabase JS client
// automatically picks up the access_token from the URL hash (implicit flow),
// so once we detect a recovery session we let the user choose a new PIN and
// call supabase.auth.updateUser({password}) to swap it in.
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { EXAM_DATE_DEFAULT } from '@/lib/constants';
import { Button } from '@/components/ui/Button';
import PinInput from '@/components/auth/PinInput';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import Brand from '@/components/shared/Brand';
import ThemeToggle from '@/components/shared/ThemeToggle';

type ScreenState =
  | { kind: 'checking' }
  | { kind: 'no_session' }
  | { kind: 'ready'; email: string }
  | { kind: 'sending' }
  | { kind: 'done' }
  | { kind: 'error'; message: string };

const PIN_RE = /^\d{6}$/;

export default function ResetPin() {
  const [state, setState] = useState<ScreenState>({ kind: 'checking' });
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!supabaseConfigured) {
      setState({ kind: 'no_session' });
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user?.email) {
        setState({ kind: 'ready', email: data.session.user.email });
      } else {
        setState({ kind: 'no_session' });
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session?.user?.email) {
        setState({ kind: 'ready', email: session.user.email });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const canSubmit =
    (state.kind === 'ready' || (state.kind !== 'sending' && state.kind !== 'done')) &&
    PIN_RE.test(pin) &&
    pin === confirm;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (state.kind !== 'ready' || !canSubmit) return;
    setState({ kind: 'sending' });
    const { error } = await supabase.auth.updateUser({ password: pin });
    if (error) {
      setState({ kind: 'error', message: error.message });
      return;
    }
    // Sign out so the user re-authenticates with the new PIN (clean session state).
    await supabase.auth.signOut();
    setState({ kind: 'done' });
    setTimeout(() => navigate('/auth', { replace: true }), 1500);
  }

  const daysLeft = differenceInCalendarDays(parseISO(EXAM_DATE_DEFAULT), new Date());

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
              Set a new PIN.
            </h1>
            {state.kind === 'ready' && (
              <p className="mt-2 text-[13px] leading-relaxed text-text-muted">
                Resetting the PIN for the account linked to{' '}
                <span className="u-num text-text">{state.email}</span>.
              </p>
            )}
          </div>

          <div className="u-rule my-6" />

          {state.kind === 'checking' && (
            <p className="animate-pulse text-[13px] text-text-faint">Verifying reset link…</p>
          )}

          {state.kind === 'no_session' && (
            <div className="rounded border border-warn/40 bg-warn/5 px-4 py-4">
              <p className="text-[13px] leading-relaxed text-warn">
                No active reset session found. Either the link expired or was already used.
              </p>
              <Link
                to="/forgot-pin"
                className="mt-3 inline-block text-[12px] font-medium text-accent hover:underline"
              >
                Request a new reset link
              </Link>
            </div>
          )}

          {(state.kind === 'ready' ||
            state.kind === 'sending' ||
            state.kind === 'error') && (
            <form onSubmit={onSubmit} noValidate>
              <label className="u-label block">New 6-digit PIN</label>
              <div className="mt-2">
                <PinInput value={pin} onChange={setPin} disabled={state.kind === 'sending'} />
              </div>
              <label className="u-label mt-4 block">Confirm new PIN</label>
              <div className="mt-2">
                <PinInput value={confirm} onChange={setConfirm} disabled={state.kind === 'sending'} />
              </div>
              <Button
                type="submit"
                variant="primary"
                disabled={state.kind === 'sending' || !canSubmit}
                className="mt-6 w-full"
              >
                {state.kind === 'sending' ? 'Updating…' : 'Save new PIN'}
              </Button>
              {confirm.length === 6 && pin !== confirm && (
                <p className="mt-3 text-xs text-warn">PINs do not match.</p>
              )}
              {state.kind === 'error' && (
                <p className="mt-3 text-xs font-medium text-danger">{state.message}</p>
              )}
            </form>
          )}

          {state.kind === 'done' && (
            <div className="rounded border border-success/30 bg-success/5 px-4 py-4">
              <p className="font-display text-[15px] font-semibold text-success">PIN updated.</p>
              <p className="mt-1 text-[12.5px] text-text-muted">Sending you to sign in…</p>
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
