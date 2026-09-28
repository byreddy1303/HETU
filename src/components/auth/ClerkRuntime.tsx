import { useEffect, useState, type ReactNode } from 'react';
import { ClerkProvider, useAuth, useUser } from '@clerk/react';
import { configureClerkRuntime, resetClerkRuntime } from '@/lib/fastapi-client';
import { backendConfig } from '@/lib/backend-config';
import LoadingScreen from '@/components/shared/LoadingScreen';

function Runtime({ children }: { children: ReactNode }) {
  const { isLoaded, getToken, signOut, sessionId } = useAuth();
  const { isLoaded: userLoaded, user } = useUser();
  const [bound, setBound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !userLoaded) return;
    const controller = new AbortController();
    setBound(false);
    setError(null);

    if (!user) {
      configureClerkRuntime({ loaded: true, user: null, getToken, signOut });
      setBound(true);
      return () => controller.abort();
    }

    void (async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error('The session token is unavailable. Please sign in again.');
        const response = await fetch(`${backendConfig.apiUrl}/v1/me`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
          signal: controller.signal
        });
        const body = await response.json().catch(() => null) as {
          id?: unknown; email?: unknown; username?: unknown; profile?: unknown; detail?: unknown
        } | null;
        if (!response.ok) {
          const detail = typeof body?.detail === 'string' ? body.detail : `API request failed (${response.status})`;
          throw new Error(detail);
        }
        if (typeof body?.id !== 'string' || !body.id) {
          throw new Error('The API returned an invalid account identity.');
        }
        configureClerkRuntime({
          loaded: true,
          user: {
            id: body.id,
            email: typeof body.email === 'string' ? body.email : user.primaryEmailAddress?.emailAddress,
            username: typeof body.username === 'string' ? body.username : user.username,
            user_metadata: {
              ...(body.profile && typeof body.profile === 'object' ? body.profile : {}),
              first_name: user.firstName,
              last_name: user.lastName
            }
          },
          getToken,
          signOut
        });
        setBound(true);
      } catch (cause) {
        if (controller.signal.aborted) return;
        resetClerkRuntime();
        setError(cause instanceof Error ? cause.message : 'Unable to load your account.');
      }
    })();

    return () => controller.abort();

  }, [getToken, isLoaded, user, userLoaded, signOut, sessionId]);

  useEffect(() => () => resetClerkRuntime(), []);

  if (error) return (
    <main role="alert" className="p-8">
      <h1>Unable to load your account</h1>
      <p>{error}</p>
    </main>
  );
  return bound && isLoaded && userLoaded ? children : <LoadingScreen />;
}

export default function ClerkRuntime({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider publishableKey={backendConfig.clerkKey}>
      <Runtime>{children}</Runtime>
    </ClerkProvider>
  );
}
