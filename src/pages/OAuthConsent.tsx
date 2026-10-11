import { OAuthConsent, Show } from '@clerk/react';
import { Navigate } from 'react-router-dom';

export default function OAuthConsentPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg p-6">
      <Show when="signed-in" fallback={<Navigate to="/auth" replace />}>
        <OAuthConsent />
      </Show>
    </main>
  );
}
