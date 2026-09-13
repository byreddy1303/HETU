// Trusted-device recovery ("remember this device"). After the user proves who
// they are once with their username + PIN, this keeps the refresh token at
// hand so the same browser can silently restore the session on later visits —
// the login screen is never needed again on a device that has signed in
// before.
//
// The record lives under the `air.` prefix on purpose: the isolation sweep and
// explicit sign-out both drop it, so "Sign out" and "Wipe local" are still
// honoured. It is per-browser and single-slot (the latest successful login
// wins). Storing a refresh token here is no worse than supabase-js's own
// session-storage decision, and it is never the user's PIN.
const TRUST_KEY = 'air.device-trust';
const TRUST_VERSION = 1 as const;

export interface TrustedDeviceRecord {
  version: typeof TRUST_VERSION;
  userId: string;
  username: string;
  refreshToken: string;
  trustedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function readTrustedDevice(): TrustedDeviceRecord | null {
  try {
    const raw = localStorage.getItem(TRUST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      !isRecord(parsed) ||
      parsed.version !== TRUST_VERSION ||
      !nonEmptyString(parsed.userId) ||
      !nonEmptyString(parsed.username) ||
      !nonEmptyString(parsed.refreshToken) ||
      typeof parsed.trustedAt !== 'string'
    ) {
      return null;
    }
    return {
      version: TRUST_VERSION,
      userId: parsed.userId,
      username: parsed.username,
      refreshToken: parsed.refreshToken,
      trustedAt: parsed.trustedAt
    };
  } catch {
    return null;
  }
}

export function rememberTrustedDevice(record: {
  userId: string;
  username: string;
  refreshToken: string;
}): void {
  if (
    !nonEmptyString(record.userId) ||
    !nonEmptyString(record.username) ||
    !nonEmptyString(record.refreshToken)
  ) {
    return;
  }
  try {
    localStorage.setItem(
      TRUST_KEY,
      JSON.stringify({
        version: TRUST_VERSION,
        userId: record.userId,
        username: record.username,
        refreshToken: record.refreshToken,
        trustedAt: new Date().toISOString()
      })
    );
  } catch {
    // Trusted-device restore is best-effort; normal session storage still works.
  }
}

export function hasTrustedDevice(): boolean {
  return readTrustedDevice() !== null;
}

export function clearTrustedDevice(): void {
  try {
    localStorage.removeItem(TRUST_KEY);
  } catch {
    // Nothing to do; the isolation sweep covers this key as well.
  }
}