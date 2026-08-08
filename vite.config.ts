import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig(({ mode }) => {
  const nativeBuild = mode === 'capacitor';
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  if (nativeBuild) {
    let validUrl = false;
    try {
      const parsed = new URL(env.VITE_SUPABASE_URL ?? '');
      validUrl = parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      validUrl = false;
    }

    if (!validUrl || !env.VITE_SUPABASE_ANON_KEY) {
      throw new Error(
        'Native build requires valid VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY values.'
      );
    }
  }

  return {
    plugins: [
      react(),
      VitePWA({
        disable: nativeBuild,
        registerType: 'autoUpdate',
        manifest: {
          name: 'AIR Journal',
          short_name: 'AIR',
          description: 'GATE PYQ analysis — compress your mistake surface.',
          theme_color: '#F1F5F0',
          background_color: '#F1F5F0',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: '/air-mark-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/air-mark-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            {
              src: '/air-mark-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            },
            { src: '/air-mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
            {
              src: '/air-mark-maskable.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'maskable'
            }
          ]
        },
        workbox: {
          importScripts: ['/push-sw.js'],
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
          runtimeCaching: [
            {
              urlPattern: ({ url }) =>
                url.origin === self.location.origin && url.pathname.startsWith('/pyq/images/'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'air-pyq-images-v1',
                expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 365 }
              }
            },
            {
              urlPattern: ({ url }) =>
                url.origin === self.location.origin &&
                url.pathname.startsWith('/pyq/') &&
                url.pathname.endsWith('.json'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'air-pyq-data-v3',
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 30 }
              }
            }
          ]
        }
      })
    ],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') }
    },
    server: { port: 5173 }
  };
});
