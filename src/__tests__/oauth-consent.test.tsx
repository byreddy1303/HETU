import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@clerk/react', () => ({
  Show: ({ fallback }: { fallback: ReactNode }) => fallback,
  OAuthConsent: () => <p>Consent</p>
}));
import OAuthConsentPage from '@/pages/OAuthConsent';
afterEach(cleanup);

it('retains the complete consent request when a signed-out user needs to sign in', async () => {
  const returnPath = '/oauth-consent?client_id=synthetic&scope=hetu%3Aread+hetu%3Awrite&state=test%2Bvalue';
  function SignInDestination() {
    const location = useLocation();
    return <p>{new URLSearchParams(location.search).get('redirect_url')}</p>;
  }
  render(<MemoryRouter initialEntries={[returnPath]}>
    <Routes>
      <Route path="/oauth-consent" element={<OAuthConsentPage />} />
      <Route path="/auth" element={<SignInDestination />} />
    </Routes>
  </MemoryRouter>);
  expect(await screen.findByText(returnPath)).toBeInTheDocument();
});
