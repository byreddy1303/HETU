import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ClerkProvider, useAuth, useUser } from '@clerk/react';
import { configureClerkRuntime, resetClerkRuntime } from '@/lib/fastapi-client';
import { backendConfig } from '@/lib/backend-config';
import LoadingScreen from '@/components/shared/LoadingScreen';

function Runtime({ children }: { children: ReactNode }) {
  const { isLoaded, getToken, signOut, sessionId } = useAuth();
  const { isLoaded: userLoaded, user } = useUser();
  const [bound, setBound] = useState(false);
  const apiUser = useMemo(() => user ? {
    id: user.id,
    email: user.primaryEmailAddress?.emailAddress,
    username: user.username,
    user_metadata: { first_name: user.firstName, last_name: user.lastName }
  } : null, [user]);

  useEffect(() => {
    if (!isLoaded || !userLoaded) return;
    configureClerkRuntime({ loaded: true, user: apiUser, getToken, signOut });
    setBound(true);

  }, [apiUser, getToken, isLoaded, userLoaded, signOut, sessionId]);

  useEffect(() => () => resetClerkRuntime(), []);

  return bound && isLoaded && userLoaded ? children : <LoadingScreen />;
}

export default function ClerkRuntime({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider publishableKey={backendConfig.clerkKey}>
      <Runtime>{children}</Runtime>
    </ClerkProvider>
  );
}
