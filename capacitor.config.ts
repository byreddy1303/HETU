/// <reference types="@capacitor/push-notifications" />
import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize, KeyboardStyle } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'in.airjournal.app',
  appName: 'HETU',
  webDir: 'dist',
  backgroundColor: '#F6F1E9',
  loggingBehavior: 'production',
  server: {
    // Load assets from Vercel so any deployed update reaches all installed
    // apps immediately without requiring a new APK.
    url: 'https://hetu-app.vercel.app',
    hostname: 'hetu-app.vercel.app',
    androidScheme: 'https',
    cleartext: false
  },
  android: {
    backgroundColor: '#F6F1E9',
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
      backgroundColor: '#F6F1E9',
      showSpinner: false
    },
    PushNotifications: {
      presentationOptions: ['sound', 'alert']
    }
  }
};

export default config;
