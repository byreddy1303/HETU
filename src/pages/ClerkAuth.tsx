import { SignIn } from '@clerk/react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import Brand from '@/components/shared/Brand';

export default function ClerkAuth() {
  const { status } = useAuth();
  const [params] = useSearchParams();
  if (status === 'signed_in') return <Navigate to="/" replace />;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-bg p-6">
      <Brand size="sm" />
      {params.get('created') === '1' && (
        <p role="status" className="text-sm text-text-muted">Account created. Sign in with your new email and password.</p>
      )}
      <SignIn routing="hash" forceRedirectUrl="/" withSignUp={false} />
    </main>
  );
}
