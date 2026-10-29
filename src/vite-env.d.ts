/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
  readonly VITE_APP_URL?: string;
  readonly VITE_WEB_PUSH_PUBLIC_KEY?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_TELEGRAM_BOT_USERNAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface DesktopDailyBriefConfig {
  enabled: boolean;
  time: string;
  timezone: string;
  autoLaunch: boolean;
  autoLaunchSupported: boolean;
  autoLaunchInstalled: boolean;
  last_shown_on: string | null;
  last_error: string | null;
}

interface Window {
  electronAPI?: {
    platform: string;
    isElectron: boolean;
    apiUrl?: string;
    getAppVersion(): Promise<string>;
    getDailyBrief(): Promise<DesktopDailyBriefConfig>;
    saveDailyBrief(
      patch: Pick<DesktopDailyBriefConfig, 'enabled' | 'time' | 'autoLaunch'>
    ): Promise<DesktopDailyBriefConfig>;
    previewDailyBrief(): Promise<{ shown: boolean; held?: boolean }>;
    onBriefNavigate(listener: (route: string) => void): () => void;
  };
}
