import { lazy, Suspense, type ReactNode } from 'react';
import { backendConfig } from '@/lib/backend-config';
import LoadingScreen from '@/components/shared/LoadingScreen';

const ClerkRuntime = lazy(() => import('@/components/auth/ClerkRuntime'));

export default function AuthProvider({ children }: { children: ReactNode }) {
  if (backendConfig.error) return (
    <main role="alert" className="p-8">
      <h1>Sign-in configuration needs attention</h1>
      <p>{backendConfig.error}</p>
    </main>
  );
  return <Suspense fallback={<LoadingScreen />}><ClerkRuntime>{children}</ClerkRuntime></Suspense>;
}
