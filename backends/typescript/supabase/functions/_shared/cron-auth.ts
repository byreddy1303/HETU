/**
 * Read a role claim from a JWT that Supabase's function gateway has already
 * verified. This is claim parsing, not signature verification; callers must
 * keep verify_jwt enabled for the function.
 */
export function jwtRoleClaim(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1] || !parts[2]) return null;

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded)) as { role?: unknown };
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}
