import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import LoadingScreen from '@/components/shared/LoadingScreen';

const Landing = lazy(() => import('@/pages/Landing'));

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const { pathname } = useLocation();
  if (status === 'loading') return <LoadingScreen />;
  if (status === 'signed_out' && pathname === '/') {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Landing />
      </Suspense>
    );
  }
  if (status === 'signed_out') return <Navigate to="/auth" replace />;
  return <>{children}</>;
}
