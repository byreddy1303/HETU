import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserRow } from '@/types';
const fixture = vi.hoisted(() => ({
  profile: {
    id: 'local_user',
    username: 'kalyan',
    name: 'Kalyan',
    timezone: 'Asia/Kolkata',
    exam_date: '2027-02-07',
    target_rank: 100
  } as unknown as UserRow,
  updateProfile: vi.fn(),
  signOut: vi.fn()
}));
vi.mock('@/lib/backend-config', () => ({
  backendConfig: { isLocal: true, fastapi: true, apiUrl: 'http://127.0.0.1:8765' }
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ userId: 'local_user', sandbox: false }) }));
vi.mock('@/stores/auth', () => ({
  useAuthStore: (selector: (state: typeof fixture) => unknown) => selector(fixture)
}));
vi.mock('@/components/settings/LocalModelSettings', () => ({
  default: () => (
    <section id="settings-model">
      <h2>Local model</h2>
    </section>
  )
}));
vi.mock('@/components/settings/BackupHealthCard', () => ({
  default: () => (
    <section id="settings-backups">
      <h2>Database backups</h2>
    </section>
  )
}));
beforeEach(() => {
  cleanup();
  fixture.updateProfile.mockReset().mockResolvedValue({});
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ checks: { database: 'ok' } })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function mount() {
  const { default: Settings } = await import('@/pages/Settings');
  render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>
  );
  await screen.findByText('Database ready');
}
describe('local-only desktop settings', () => {
  it('keeps useful local controls and removes hosted/mobile/unfinished surfaces', async () => {
    await mount();
    for (const heading of [
      'Study defaults',
      'Appearance',
      'Your profile',
      'Local model',
      'Database backups',
      'Export'
    ])
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Kalyan');
    expect(screen.queryByText('Invites')).not.toBeInTheDocument();
    expect(screen.queryByText(/Cognitive AI engine/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Telegram|Email notifications|Tactile feedback/)
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Connect an AI client through local MCP').closest('details')
    ).not.toHaveAttribute('open');
  });
  it('preserves only edited profile fields and makes a failed save retryable', async () => {
    await mount();
    fixture.updateProfile.mockRejectedValueOnce(new Error('Database busy'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Kalyan Reddy' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Database busy');
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await screen.findByText('Profile saved on this workspace.');
    expect(fixture.updateProfile).toHaveBeenLastCalledWith({ name: 'Kalyan Reddy' });
  });
  it('uses section navigation without changing a desktop hash route', async () => {
    await mount();
    const target = document.getElementById('settings-profile')!;
    target.scrollIntoView = vi.fn();
    const hash = window.location.hash;
    fireEvent.click(screen.getByRole('link', { name: 'Your profile' }));
    expect(target.scrollIntoView).toHaveBeenCalledOnce();
    expect(target).toHaveFocus();
    expect(window.location.hash).toBe(hash);
  });
  it('can retry a failed database health check', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ checks: { database: 'error' } }, { status: 503 })
    );
    const { default: Settings } = await import('@/pages/Settings');
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('local database is unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Check database' }));
    await waitFor(() => expect(screen.getByText('Database ready')).toBeInTheDocument());
  });
});
