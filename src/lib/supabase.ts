import { createClient } from '@supabase/supabase-js';
import { backendConfig } from '@/lib/backend-config';
import { fastapiClient } from '@/lib/fastapi-client';
export type { ApiUser } from '@/lib/fastapi-client';
export type { RealtimeChannel } from '@/lib/fastapi-realtime';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export function isValidSupabaseUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/** False when env is missing — app still boots for local-only work / UI dev. */
const legacyConfigured = Boolean(isValidSupabaseUrl(url) && anonKey);
// A misconfigured cutover must never silently turn durable writes into RAM-only writes.
export const supabaseConfigured = backendConfig.fastapi || legacyConfigured;

if (!supabaseConfigured) {
  console.warn(
    '[air] Supabase URL/key missing or invalid — running local-only instead of blocking startup.'
  );
}

const clientUrl = legacyConfigured ? url : 'http://localhost:54321';
const clientKey = legacyConfigured ? anonKey : 'anon-key';

// The app depends on this deliberately bounded compatibility interface, not
// the full Supabase SDK. Keep vendor types intact; do not shadow its module.
export const supabase: typeof fastapiClient = backendConfig.fastapi ? fastapiClient : createClient(clientUrl!, clientKey!, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
}) as unknown as typeof fastapiClient;
