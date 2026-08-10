import { Suspense, useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { router } from '@/router';
import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/auth';
import { usePrefsStore } from '@/stores/prefs';
import { Toaster } from '@/components/ui/Toast';
import NativeRuntime from '@/components/native/NativeRuntime';
import BuddyNotificationRuntime from '@/components/notifications/BuddyNotificationRuntime';
import BuddyPresenceRuntime from '@/components/buddy/BuddyPresenceRuntime';
import LoadingScreen from '@/components/shared/LoadingScreen';
import { applyTheme, resolveTheme } from '@/lib/theme';
import { configureNativeChrome } from '@/lib/native';

const FONT_SCALE_PX: Record<'small' | 'normal' | 'large', string> = {
  small: '14px',
  normal: '16px',
  large: '18px'
};

export default function App() {
  const init = useAuthStore((s) => s.init);
  const fontScale = usePrefsStore((s) => s.fontScale);
  const compactRows = usePrefsStore((s) => s.compactRows);
  const colorTheme = usePrefsStore((s) => s.colorTheme);
  useEffect(() => init(), [init]);
  useEffect(() => {
    document.documentElement.style.fontSize = FONT_SCALE_PX[fontScale];
  }, [fontScale]);
  useEffect(() => {
    document.documentElement.dataset.density = compactRows ? 'compact' : 'comfy';
  }, [compactRows]);
  useEffect(() => {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
    const syncTheme = () => {
      const resolved = resolveTheme(colorTheme, systemTheme.matches);
      applyTheme(resolved);
      void configureNativeChrome(resolved);
    };

    syncTheme();
    if (colorTheme !== 'system') return;
    systemTheme.addEventListener('change', syncTheme);
    return () => systemTheme.removeEventListener('change', syncTheme);
  }, [colorTheme]);
  return (
    <QueryClientProvider client={queryClient}>
      <NativeRuntime />
      <BuddyNotificationRuntime />
      <BuddyPresenceRuntime />
      <Suspense fallback={<LoadingScreen />}>
        <RouterProvider router={router} />
      </Suspense>
      <Toaster />
    </QueryClientProvider>
  );
}
