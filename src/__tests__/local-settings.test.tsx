import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { usePrefsStore } from '@/stores/prefs';
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
  signOut: vi.fn(),
  collectProgress: vi.fn(),
  downloadProgress: vi.fn()
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
vi.mock('@/lib/progress-export', () => ({
  collectProgressReport: fixture.collectProgress,
  downloadProgressReport: fixture.downloadProgress
}));
vi.mock('@/components/settings/BackupHealthCard', () => ({
  default: ({ children }: { children?: ReactNode }) => (
    <section id="settings-backups">
      <h2>Backups & export</h2>
      {children}
    </section>
  )
}));
beforeEach(() => {
  cleanup();
  fixture.updateProfile.mockReset().mockResolvedValue({});
  fixture.collectProgress.mockReset().mockResolvedValue({ rows: [] });
  fixture.downloadProgress.mockReset();
  usePrefsStore.getState().reset();
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
  await screen.findByRole('textbox', { name: 'Name' });
}
describe('local-only desktop settings', () => {
  it('shows everyday preferences and removes unused or hosted-only controls', async () => {
    await mount();
    for (const heading of ['Appearance', 'Your study', 'Backups & export'])
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Kalyan');
    expect(screen.queryByRole('navigation', { name: 'Settings sections' })).not.toBeInTheDocument();
    expect(screen.queryByText('Local model')).not.toBeInTheDocument();
    expect(screen.queryByText('Invites')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Telegram|Email notifications|Tactile feedback/)
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Advanced', { exact: true }));
    await screen.findByText('Database ready');
    expect(screen.queryByLabelText('Weekly review day')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Target AIR')).not.toBeInTheDocument();
    expect(screen.queryByText(/npm run|remote connectors/)).not.toBeInTheDocument();
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
    await screen.findByText('Profile saved.');
    expect(fixture.updateProfile).toHaveBeenLastCalledWith({ name: 'Kalyan Reddy' });
  });
  it('opens advanced tools without changing the route and preserves appearance when editing defaults', async () => {
    await mount();
    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'dark' } });
    const hash = window.location.hash;
    fireEvent.click(screen.getByText('Advanced', { exact: true }));
    await screen.findByRole('heading', { name: 'Local model' });
    fireEvent.change(screen.getByLabelText('Daily question target'), { target: { value: '25' } });
    expect(usePrefsStore.getState()).toMatchObject({ dailyQuestionTarget: 25, colorTheme: 'dark' });
    expect(window.location.hash).toBe(hash);
  });
  it('keeps export failure retryable without affecting the profile', async () => {
    await mount();
    fixture.collectProgress.mockRejectedValueOnce(new Error('Export unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'Download progress' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Export unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Download progress' }));
    await screen.findByText('Progress report downloaded.');
    expect(fixture.collectProgress).toHaveBeenLastCalledWith('local_user', 'Kalyan');
    expect(fixture.downloadProgress).toHaveBeenCalledOnce();
    expect(fixture.updateProfile).not.toHaveBeenCalled();
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
    fireEvent.click(screen.getByText('Advanced', { exact: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent('local database is unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Check database' }));
    await waitFor(() => expect(screen.getByText('Database ready')).toBeInTheDocument());
  });
});
