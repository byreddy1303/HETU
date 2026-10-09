import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { rmSync } from 'node:fs';

export default defineConfig(({ mode }) => {
  const nativeBuild = mode === 'capacitor';
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  if (mode !== 'test') {
    let validUrl = false;
    try {
      const value = env.VITE_API_URL ?? '';
      const parsed = new URL(value, nativeBuild ? undefined : 'https://hetu-app.vercel.app');
      validUrl = ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password
        && !parsed.search && !parsed.hash && (!nativeBuild || parsed.protocol === 'https:');
    } catch { /* invalid or missing API origin */ }
    if ((env.VITE_BACKEND && env.VITE_BACKEND !== 'fastapi') || !env.VITE_API_URL || !validUrl
      || !/^pk_(test|live)_\S+$/.test(env.VITE_CLERK_PUBLISHABLE_KEY ?? '')) {
      throw new Error('HETU requires VITE_BACKEND=fastapi, VITE_API_URL and VITE_CLERK_PUBLISHABLE_KEY. Android requires an absolute HTTPS API URL.');
    }
  }

  return {
    plugins: [
      react(),
      VitePWA({
        disable: nativeBuild,
        registerType: 'autoUpdate',
        manifest: {
          name: 'HETU',
          short_name: 'HETU',
          description: 'Find the reason behind every mistake.',
          theme_color: '#F3F7FF',
          background_color: '#F3F7FF',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: '/hetu-cobalt-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/hetu-cobalt-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            {
              src: '/hetu-cobalt-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ]
        },
        workbox: {
          navigateFallbackDenylist: [/^\/api(?:\/|$)/, /^\/gate-topper-notes\//],
          importScripts: ['/push-sw.js'],
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
          runtimeCaching: [
            {
              urlPattern: ({ url }) =>
                url.origin === self.location.origin && url.pathname.startsWith('/pyq/images/'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'air-pyq-images-v1',
                expiration: { maxEntries: 800, maxAgeSeconds: 60 * 60 * 24 * 365 }
              }
            }
          ]
        }
      }),
      ...(nativeBuild
        ? [
            {
              name: 'exclude-hosted-topper-notes-from-native-bundle',
              closeBundle() {
                // PDFs remain hosted by the web app and open externally on native.
                // Keeping 215 MB of source material out of every APK preserves a
                // practical install size without removing access to the library.
                rmSync(path.resolve(__dirname, 'dist/gate-topper-notes'), {
                  recursive: true,
                  force: true
                });
              }
            }
          ]
        : [])
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    },
    server: { port: 5173 }
  };
});
