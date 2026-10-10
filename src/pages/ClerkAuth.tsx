import { useEffect, useRef, useState, type FormEvent } from 'react';
import { SignIn } from '@clerk/react';
import { useSignIn } from '@clerk/react/legacy';
import { isClerkAPIResponseError } from '@clerk/react/errors';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import Brand from '@/components/shared/Brand';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function ClerkAuth() {
  const { status } = useAuth();
  const { isLoaded, signIn, setActive } = useSignIn();
  const [params] = useSearchParams();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [verification, setVerification] = useState(false);
  const operation = useRef(0);
  useEffect(() => () => { operation.current += 1; }, []);
  if (status === 'signed_in') return <Navigate to="/" replace />;
  const invite = params.get('invite');
  if (invite) return <Navigate to={`/signup?invite=${encodeURIComponent(invite)}`} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!isLoaded || !signIn || !identifier.trim() || !password || sending) return;
    const attempt = ++operation.current;
    setSending(true); setError('');
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        signIn.create({ identifier: identifier.trim(), password, strategy: 'password' }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Sign-in took too long. Check your connection and try again.')), 30_000);
        })
      ]);
      if (attempt !== operation.current) return;
      clearTimeout(timeout);
      if (result.status === 'complete' && result.createdSessionId) {
        await Promise.race([
          setActive({ session: result.createdSessionId }),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error('Sign-in took too long to finish. Reload to check your session.')), 15_000);
          })
        ]);
      } else {
        setVerification(true);
        setError('Your account needs additional verification. Continue below.');
      }
    } catch (cause) {
      if (attempt !== operation.current) return;
      let message = cause instanceof Error && cause.message.includes('took too long')
        ? cause.message : 'Unable to sign in. Check your username or email and password, then try again.';
      if (isClerkAPIResponseError(cause)) {
        const locked = cause.errors.find(({ code }) => code === 'user_locked');
        if (locked) {
          message = locked.longMessage || 'Your account is temporarily locked. Wait before trying again.';
        } else if (cause.errors.some(({ code }) =>
          code === 'form_password_compromised' || code === 'form_password_pwned'
        )) {
          message = 'Your existing PIN or password requires a security reset. Continue below to see your account’s available verification methods.';
          setVerification(true);
        } else if (cause.status >= 500) {
          message = 'The sign-in service is temporarily unavailable. Please try again shortly.';
        }
      }
      setError(message);
    } finally {
      clearTimeout(timeout);
      if (attempt === operation.current) setSending(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-bg p-6">
      <Brand size="sm" />
      <section className="u-panel w-full max-w-[440px] p-8" aria-labelledby="signin-title">
        <h1 id="signin-title" className="font-display text-2xl font-bold">Sign in to HETU</h1>
        <p className="mt-2 text-sm text-text-muted">Use your existing username and PIN, or your email and password.</p>
        {params.get('created') === '1' && (
          <p role="status" className="mt-3 text-sm text-text-muted">Account created. Sign in with your new credentials.</p>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
        {verification ? <SignIn routing="hash" forceRedirectUrl="/" withSignUp={false} /> : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block" htmlFor="signin-identifier">
              <span className="u-label">Username or email</span>
              <Input id="signin-identifier" autoComplete="username" autoCapitalize="none" spellCheck={false}
                maxLength={320} value={identifier} onChange={(event) => setIdentifier(event.target.value)} className="mt-2" required />
            </label>
            <label className="block" htmlFor="signin-password">
              <span className="u-label">Password or existing PIN</span>
              <Input id="signin-password" type="password" autoComplete="current-password" maxLength={256}
                value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2" required />
            </label>
            <Button type="submit" disabled={!isLoaded || sending || !identifier.trim() || !password} className="w-full">
              {sending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        )}
      </section>
      <Link to="/request-access" className="text-sm text-accent underline">Request access</Link>
    </main>
  );
}
