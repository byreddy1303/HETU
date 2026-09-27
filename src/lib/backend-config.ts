// Rollout is explicit: adding staging keys must not switch existing accounts.
export function isValidApiUrl(value: string | undefined): boolean {
  if (!value || value.trim() !== value) return false;
  if (/^\/(?!\/)[^?#\\]*$/.test(value)) return true;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) &&
      !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

export function readBackendConfig(env: Record<string, string | undefined>) {
  const backend = env.VITE_BACKEND || 'supabase';
  const apiUrl = (env.VITE_API_URL || '').replace(/\/+$/, '');
  const clerkKey = env.VITE_CLERK_PUBLISHABLE_KEY || '';
  const error = !['supabase', 'fastapi'].includes(backend)
    ? 'VITE_BACKEND must be supabase or fastapi.'
    : backend === 'fastapi' && (!isValidApiUrl(env.VITE_API_URL) || !/^pk_(test|live)_\S+$/.test(clerkKey))
      ? 'FastAPI requires a valid VITE_API_URL and VITE_CLERK_PUBLISHABLE_KEY.'
      : null;
  return { backend, apiUrl, clerkKey, error, fastapi: backend === 'fastapi' };
}

export const backendConfig = readBackendConfig(import.meta.env);
