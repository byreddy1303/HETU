// /signup — invite-only. Reached with ?invite=<token>. Anyone landing here
// without a token is shown the "invite required" panel and sent to
// /request-access. The old bootstrap path (first user becomes owner) is gone.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { useAuthStore } from '@/stores/auth';
import { useAuth } from '@/hooks/useAuth';
import { supabaseConfigured } from '@/lib/supabase';
import { EXAM_DATE_DEFAULT } from '@/lib/constants';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import PinInput from '@/components/auth/PinInput';
import { isUsernameAvailable } from '@/lib/edge';
import { cn } from '@/lib/utils';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import Brand from '@/components/shared/Brand';

type SubmitState = { kind: 'idle' } | { kind: 'sending' } | { kind: 'error'; message: string };

const USERNAME_RE = /^[a-z0-9_]{3,32}$/;
const PIN_RE = /^\d{6}$/;

export default function Signup() {
  const { status } = useAuth();
  const [params] = useSearchParams();
  const inviteToken = params.get('invite') ?? '';
  const invited = inviteToken.length > 0;
  const signUp = useAuthStore((s) => s.signUp);
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [usernameCheck, setUsernameCheck] = useState<'idle' | 'checking' | 'ok' | 'taken'>('idle');
  const [state, setState] = useState<SubmitState>({ kind: 'idle' });

  // Strip anything that isn't [a-z0-9_] so users can't accidentally type an
  // email or spaces into the username field.
  function sanitizeUsername(raw: string): string {
    return raw.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 32);
  }

  // Auto-suggest a username from the display name until the user types into
  // the field themselves.
  useEffect(() => {
    if (usernameTouched) return;
    const suggested = sanitizeUsername(name);
    if (suggested.length >= 3) setUsername(suggested);
  }, [name, usernameTouched]);

  // Debounced username availability check for a nice UX hint.
  useEffect(() => {
    const u = username.trim().toLowerCase();
    if (!USERNAME_RE.test(u)) {
      setUsernameCheck('idle');
      return;
    }
    setUsernameCheck('checking');
    const handle = setTimeout(async () => {
      const ok = await isUsernameAvailable(u);
      setUsernameCheck(ok ? 'ok' : 'taken');
    }, 400);
    return () => clearTimeout(handle);
  }, [username]);

  if (status === 'signed_in') return <Navigate to="/" replace />;

  const cleanedUsername = username.trim().toLowerCase();
  const cleanedName = name.trim();
  const usernameTooShort = cleanedUsername.length > 0 && cleanedUsername.length < 3;
  const usernameValid = USERNAME_RE.test(cleanedUsername) && usernameCheck !== 'taken';
  const pinValid = PIN_RE.test(pin);
  const pinsMatch = pin === confirm && confirm.length === 6;
  const nameValid = cleanedName.length >= 1 && cleanedName.length <= 80;
  const canSubmit =
    state.kind !== 'sending' && usernameValid && pinValid && pinsMatch && nameValid;

  const missingReasons: string[] = [];
  if (!nameValid) missingReasons.push('name');
  if (!usernameValid) missingReasons.push(usernameTooShort ? 'longer username' : 'valid username');
  if (!pinValid) missingReasons.push('6-digit PIN');
  if (pinValid && !pinsMatch) missingReasons.push('matching PIN');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || !invited) return;
    setState({ kind: 'sending' });
    const { error } = await signUp({
      username: cleanedUsername,
      pin,
      name: cleanedName,
      invite_token: inviteToken
    });
    if (error) {
      setState({ kind: 'error', message: error });
      return;
    }
    navigate('/', { replace: true });
  }

  const daysLeft = differenceInCalendarDays(parseISO(EXAM_DATE_DEFAULT), new Date());

  return (
    <div className="native-auth-page relative flex min-h-dvh flex-col bg-bg">
      <header className="flex items-center justify-between px-6 py-4">
        <Brand size="sm" />
        <Link to="/auth" className="u-label hover:text-text">
          Have an account?
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          className="native-auth-panel u-panel relative w-full max-w-[440px] p-8"
        >
          <span className="u-stamp absolute right-6 top-7">
            {invited ? 'invite' : 'closed'}
          </span>

          <div className="u-margin-line">
            <h1 className="font-display text-[26px] font-bold leading-tight tracking-tight text-text">
              {invited ? 'Set up your account.' : 'Invite required.'}
            </h1>
            <p className="mt-2 text-[13px] leading-relaxed text-text-muted">
              {invited
                ? 'Your invite is valid. Pick a username and a 6-digit PIN — those are the only two things you use to sign in.'
                : 'AIR Journal is invite-only. Ask the owner for an invite — the link you receive drops you back here with your slot pre-filled.'}
            </p>
          </div>

          {!invited ? (
            <div className="mt-6 flex flex-col gap-3">
              <Link
                to="/request-access"
                className="inline-flex h-10 w-full items-center justify-center rounded bg-accent px-4 text-sm font-semibold text-accent-contrast shadow-key transition-all hover:-translate-y-px hover:bg-accent-hover hover:shadow-key-hover active:translate-y-[2px] active:shadow-none"
              >
                Request access
              </Link>
              <Link
                to="/auth"
                className="text-center text-[12.5px] text-text-muted hover:text-text"
              >
                I already have an account — sign in
              </Link>
            </div>
          ) : !supabaseConfigured ? (
            <p className="mt-6 rounded border border-warn/40 bg-warn/5 px-3 py-3 text-[12.5px] text-warn">
              Supabase env not configured. Fill{' '}
              <span className="u-num text-xs text-text">.env.local</span> to enable signup.
            </p>
          ) : (
            <form onSubmit={onSubmit} className="mt-5" noValidate>
              <Field label="Name" htmlFor="s-name" hint="What we call you in-app.">
                <Input
                  id="s-name"
                  autoComplete="name"
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={state.kind === 'sending'}
                  placeholder="Kalyan"
                />
              </Field>

              <Field
                label="Username"
                htmlFor="s-username"
                hint={
                  usernameCheck === 'checking'
                    ? 'Checking…'
                    : usernameCheck === 'ok'
                      ? 'Available.'
                      : usernameCheck === 'taken'
                        ? 'Taken — try another.'
                        : usernameTooShort
                          ? 'A little longer — at least 3 characters.'
                          : 'Lowercase letters, digits, or underscore only (3–32).'
                }
                hintTone={
                  usernameCheck === 'ok'
                    ? 'success'
                    : usernameCheck === 'taken' || usernameTooShort
                      ? 'warn'
                      : 'faint'
                }
              >
                <Input
                  id="s-username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={username}
                  onChange={(e) => {
                    setUsernameTouched(true);
                    setUsername(sanitizeUsername(e.target.value));
                  }}
                  disabled={state.kind === 'sending'}
                  placeholder="rank_notebook"
                  maxLength={32}
                />
              </Field>

              <Field label="6-digit PIN" htmlFor="s-pin" hint="Numeric only. Remember it.">
                <PinInput
                  id="s-pin"
                  value={pin}
                  onChange={setPin}
                  disabled={state.kind === 'sending'}
                />
              </Field>

              <Field
                label="Confirm PIN"
                htmlFor="s-confirm"
                hint={confirm.length === 6 && !pinsMatch ? 'PINs do not match.' : undefined}
                hintTone={confirm.length === 6 && !pinsMatch ? 'warn' : 'faint'}
              >
                <PinInput
                  id="s-confirm"
                  value={confirm}
                  onChange={setConfirm}
                  disabled={state.kind === 'sending'}
                />
              </Field>

              <Button
                type="submit"
                variant="primary"
                disabled={!canSubmit}
                className="mt-6 w-full"
              >
                {state.kind === 'sending' ? 'Creating your account…' : 'Create account'}
              </Button>

              <div className="mt-3 min-h-[18px]" aria-live="polite">
                {state.kind === 'error' ? (
                  <p className="text-xs font-medium text-danger">{state.message}</p>
                ) : !canSubmit && missingReasons.length > 0 ? (
                  <p className="text-[11.5px] text-text-faint">
                    Still needs: {missingReasons.join(', ')}.
                  </p>
                ) : null}
              </div>
            </form>
          )}

          <div className="mt-5 border-t border-border pt-4 text-center text-[12px] text-text-faint">
            Auth model: <span className="u-num text-text-muted">username + 6-digit PIN</span>
          </div>
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

function Field({
  label,
  htmlFor,
  hint,
  hintTone = 'faint',
  children
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  hintTone?: 'faint' | 'warn' | 'success';
  children: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="u-label">
        {label}
      </label>
      {children}
      {hint && (
        <p
          className={cn(
            'text-[11.5px]',
            hintTone === 'warn'
              ? 'text-warn'
              : hintTone === 'success'
                ? 'text-success'
                : 'text-text-faint'
          )}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
