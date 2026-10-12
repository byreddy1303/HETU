import { OAuthConsent, Show } from '@clerk/react';
import { Navigate, useLocation } from 'react-router-dom';

export default function OAuthConsentPage() {
  const location = useLocation();
  const signInPath = `/auth?redirect_url=${encodeURIComponent(location.pathname + location.search)}`;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg p-6">
      <Show when="signed-in" fallback={<Navigate to={signInPath} replace />}>
        <OAuthConsent />
      </Show>
    </main>
  );
}
