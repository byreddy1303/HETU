/// <reference types="@capacitor/push-notifications" />
import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize, KeyboardStyle } from '@capacitor/keyboard';

const liveServerUrl = process.env.CAPACITOR_LIVE_SERVER_URL?.trim();

if (liveServerUrl) {
  const parsed = new URL(liveServerUrl);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('CAPACITOR_LIVE_SERVER_URL must be a credential-free HTTPS URL.');
  }
}

const config: CapacitorConfig = {
  appId: 'in.airjournal.app',
  appName: 'AIR Journal',
  webDir: 'dist',
  backgroundColor: '#F1F5F0',
  loggingBehavior: 'production',
  server: {
    ...(liveServerUrl ? { url: liveServerUrl } : {}),
    androidScheme: 'https',
    cleartext: false
  },
  android: {
    backgroundColor: '#F1F5F0',
    allowMixedContent: false,
    webContentsDebuggingEnabled: false
  },
  plugins: {
    Keyboard: {
      resize: KeyboardResize.Native,
      style: KeyboardStyle.Light,
      resizeOnFullScreen: true
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 500,
      launchFadeOutDuration: 180,
      backgroundColor: '#F1F5F0',
      showSpinner: false
    },
    PushNotifications: {
      presentationOptions: ['sound', 'alert']
    }
  }
};

export default config;
