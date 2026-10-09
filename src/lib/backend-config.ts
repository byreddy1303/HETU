// Python is the only application backend. There is no offline or legacy fallback.
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
  const backend = env.VITE_BACKEND || 'fastapi';
  const apiUrl = (env.VITE_API_URL || '').replace(/\/+$/, '');
  const clerkKey = env.VITE_CLERK_PUBLISHABLE_KEY || '';
  const error = backend !== 'fastapi'
    ? 'HETU requires the Python backend. Set VITE_BACKEND=fastapi.'
    : (!isValidApiUrl(env.VITE_API_URL) || !/^pk_(test|live)_\S+$/.test(clerkKey))
      ? 'FastAPI requires a valid VITE_API_URL and VITE_CLERK_PUBLISHABLE_KEY.'
      : null;
  return { backend, apiUrl, clerkKey, error, fastapi: backend === 'fastapi' };
}

export const backendConfig = readBackendConfig(import.meta.env);
