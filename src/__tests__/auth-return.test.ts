import { expect, it } from 'vitest';
import { getAuthReturnPath } from '@/lib/auth-return';

const origin = 'https://hetu-app.vercel.app';

it.each([
  '/__clerk/oauth/authorize?client_id=synthetic&state=test%2Bvalue',
  '/__clerk/oauth/authorize/continue?client_id=synthetic&state=test%2Bvalue',
  '/oauth-consent?client_id=synthetic&scope=hetu%3Aread+hetu%3Awrite'
])('preserves OAuth parameters for a same-origin return to %s', (path) => {
  expect(getAuthReturnPath(path, origin)).toBe(path);
  expect(getAuthReturnPath(origin + path, origin)).toBe(path);
});

it.each([
  null, '', 'https://untrusted.example/oauth-consent', '//untrusted.example/oauth-consent',
  'https://hetu-app.vercel.app.untrusted.example/oauth-consent',
  'https://user:password@hetu-app.vercel.app/oauth-consent',
  'javascript:alert(1)', '/__clerk/other', '/oauth-consent/other', '/admin',
  '/\\untrusted.example/oauth-consent', 'https://['
])('uses the dashboard for an invalid or unrelated return URL: %s', (url) => {
  expect(getAuthReturnPath(url, origin)).toBe('/');
});
