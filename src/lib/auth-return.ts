const oauthReturnPaths = new Set([
  '/oauth-consent',
  '/__clerk/oauth/authorize',
  '/__clerk/oauth/authorize/continue'
]);

/** Resume only HETU's OAuth flow; never trust an arbitrary sign-in redirect. */
export function getAuthReturnPath(redirectUrl: string | null, origin: string): string {
  if (!redirectUrl) return '/';
  try {
    const destination = new URL(redirectUrl, origin);
    if (destination.origin !== origin || destination.username || destination.password
      || !oauthReturnPaths.has(destination.pathname)) return '/';
    return destination.pathname + destination.search;
  } catch {
    return '/';
  }
}
