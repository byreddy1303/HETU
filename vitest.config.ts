import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'dexie-react-hooks': path.resolve(__dirname, './src/lib/db-hooks.ts')
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    exclude: ['src/__tests__/e2e/**'],
    passWithNoTests: true,
    // jsdom needs a non-opaque origin to expose localStorage. Also ensures
    // Node 26's experimental Storage global doesn't shadow jsdom's.
    environmentOptions: {
      jsdom: { url: 'http://localhost' }
    },
    // Tests must never touch the real database. Blank the Supabase keys so
    // the repository runs in memory-only mode regardless of local env files.
    env: {
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: ''
    }
  }
});
