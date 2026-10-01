import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import Brand from '@/components/shared/Brand';
import ThemeToggle from '@/components/shared/ThemeToggle';
import { useAuth } from '@/hooks/useAuth';
import { inspectInvite, signupWithInvite } from '@/lib/access';

type InviteState =
  | { kind: 'loading' }
  | { kind: 'invalid'; message: string }
  | { kind: 'ready'; email: string | null }
  | { kind: 'complete' };

type SubmitState = 'idle' | 'sending' | 'error';
const USERNAME_RE = /^[a-z0-9_]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ClerkSignup() {
  const { status } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('invite') ?? '';
  const [invite, setInvite] = useState<InviteState>({ kind: 'loading' });
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submitError, setSubmitError] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (!token) {
      setInvite({ kind: 'invalid', message: 'A valid invitation link is required.' });
      return;
    }
    const controller = new AbortController();
    setInvite({ kind: 'loading' });
    void inspectInvite(token, controller.signal).then((result) => {
      setEmail(result.email ?? '');
      setInvite({ kind: 'ready', email: result.email });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setInvite({
        kind: 'invalid',
        message: error instanceof Error ? error.message : 'This invite is invalid or expired.'
      });
    });
    return () => controller.abort();
  }, [token]);

  if (status === 'signed_in') return <Navigate to="/" replace />;

  const cleanedName = name.trim();
  const cleanedUsername = username.trim().toLowerCase();
  const cleanedEmail = email.trim().toLowerCase();
  const emailLocked = invite.kind === 'ready' && invite.email !== null;
  const canSubmit = invite.kind === 'ready'
    && submitState !== 'sending'
    && cleanedName.length > 0
    && cleanedName.length <= 80
    && USERNAME_RE.test(cleanedUsername)
    && EMAIL_RE.test(cleanedEmail)
    && password.length >= 12
    && password.length <= 256
    && password === confirmPassword;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || invite.kind !== 'ready') return;
    setSubmitState('sending');
    setSubmitError('');
    try {
      await signupWithInvite({
        invite_token: token,
        name: cleanedName,
        username: cleanedUsername,
        email: cleanedEmail,
        password
      });
      setInvite({ kind: 'complete' });
      navigate('/auth?created=1', { replace: true });
    } catch (error) {
      setSubmitState('error');
      setSubmitError(error instanceof Error ? error.message : 'Unable to create your account.');
    }
  }

  return (
    <div className="native-auth-page relative flex min-h-dvh flex-col bg-bg">
      <header className="flex items-center justify-between px-6 py-4">
        <Brand size="sm" />
        <div className="flex items-center gap-3">
          <Link to="/auth" className="u-label hover:text-text">Have an account?</Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          className="native-auth-panel u-panel relative w-full max-w-[440px] p-8"
          aria-labelledby="invite-signup-title"
        >
          <span className="u-stamp absolute right-6 top-7">invite-only</span>
          <div className="u-margin-line">
            <h1 id="invite-signup-title" className="font-display text-[24px] font-bold text-text">
              Create your HETU account
            </h1>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-text-muted">
              Your account and study data will be stored in HETU’s online database.
            </p>
          </div>
          <div className="u-rule my-5" />

          {invite.kind === 'loading' ? (
            <p role="status" className="text-sm text-text-muted">Checking your invitation…</p>
          ) : invite.kind === 'invalid' ? (
            <div role="alert" className="space-y-4">
              <p className="text-sm text-danger">{invite.message}</p>
              <Link to="/request-access" className="u-label underline">Request access</Link>
            </div>
          ) : invite.kind === 'complete' ? (
            <div role="status" className="space-y-4">
              <p className="text-sm text-text">Your account is ready. Sign in to continue.</p>
              <Link to="/auth" className="u-label underline">Go to sign in</Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="space-y-4">
              {invite.email && (
                <p className="text-xs text-text-muted">This invite is for {invite.email}.</p>
              )}
              <label htmlFor="invite-name" className="block">
                <span className="u-label">Name</span>
                <Input id="invite-name" autoComplete="name" maxLength={80} required value={name}
                  onChange={(event) => setName(event.target.value)} className="mt-2" />
              </label>
              <label htmlFor="invite-username" className="block">
                <span className="u-label">Username</span>
                <Input id="invite-username" autoComplete="username" autoCapitalize="none" spellCheck={false}
                  aria-describedby="invite-username-help" maxLength={32} required value={username}
                  onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  className="mt-2" />
              </label>
              <p id="invite-username-help" className="-mt-3 text-xs text-text-muted">
                3–32 letters, numbers, or underscores.
              </p>
              <label htmlFor="invite-email" className="block">
                <span className="u-label">Email</span>
                <Input id="invite-email" type="email" autoComplete="email" maxLength={320} required value={email}
                  disabled={emailLocked}
                  onChange={(event) => setEmail(event.target.value)} className="mt-2" />
              </label>
              <label htmlFor="invite-password" className="block">
                <span className="u-label">Password</span>
                <Input id="invite-password" type="password" autoComplete="new-password" minLength={12} maxLength={256}
                  aria-describedby="invite-password-help" required value={password}
                  onChange={(event) => setPassword(event.target.value)} className="mt-2" />
              </label>
              <p id="invite-password-help" className="-mt-3 text-xs text-text-muted">
                Use at least 12 characters.
              </p>
              <label htmlFor="invite-password-confirm" className="block">
                <span className="u-label">Confirm password</span>
                <Input id="invite-password-confirm" type="password" autoComplete="new-password" maxLength={256} required
                  value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-2" />
              </label>
              {submitState === 'error' && <p role="alert" className="text-sm text-danger">{submitError}</p>}
              <Button type="submit" variant="primary" disabled={!canSubmit} className="w-full">
                {submitState === 'sending' ? 'Creating account…' : 'Create account'}
              </Button>
            </form>
          )}
        </motion.section>
      </main>
    </div>
  );
}
