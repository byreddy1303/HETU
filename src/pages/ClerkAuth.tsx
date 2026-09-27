import { SignIn } from '@clerk/react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import Brand from '@/components/shared/Brand';

export default function ClerkAuth() {
  const { status } = useAuth();
  if (status === 'signed_in') return <Navigate to="/" replace />;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-bg p-6">
      <Brand size="sm" />
      <SignIn routing="hash" forceRedirectUrl="/" withSignUp={false} />
    </main>
  );
}
