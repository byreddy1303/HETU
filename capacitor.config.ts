/// <reference types="@capacitor/push-notifications" />
import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize, KeyboardStyle } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'in.airjournal.app',
  appName: 'HETU',
  // Bundle the application shell in the APK so startup does not depend on
  // Vercel, DNS, or a network connection. The native server keeps the
  // production hostname to preserve the origin used by existing installs.
  webDir: 'dist',
  backgroundColor: '#F3F7FF',
  loggingBehavior: 'production',
  server: {
    // Serve bundled assets at the production origin. Do not set server.url:
    // that would bypass Capacitor's local asset server and make the APK's
    // application shell network-dependent again.
    hostname: 'hetu-app.vercel.app',
    androidScheme: 'https',
    cleartext: false
  },
  android: {
    backgroundColor: '#F3F7FF',
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
      backgroundColor: '#F3F7FF',
      showSpinner: false
    },
    PushNotifications: {
      presentationOptions: ['sound', 'alert']
    }
  }
};

export default config;
