import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BackupHealthCard from '@/components/settings/BackupHealthCard';
import { apiRequest } from '@/lib/fastapi-client';
vi.mock('@/lib/backend-config', () => ({ backendConfig: { isLocal: true } }));
vi.mock('@/lib/fastapi-client', () => ({ apiRequest: vi.fn() }));
const healthy = {
  state: 'ready',
  backup_dir: '/test/backups',
  last_attempt_at: '2026-10-29T06:00:00Z',
  last_success_at: '2026-10-29T06:00:00Z',
  last_error: null,
  stale: false,
  last_backup: {
    path: '/test/backups/copy.db',
    size_bytes: 8192,
    integrity: 'ok',
    file_available: true
  },
  cloud_copy: { state: 'disabled', path: null }
};
beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.mocked(apiRequest).mockResolvedValue(healthy);
});
describe('visible local backup health', () => {
  it('shows verified local success without claiming remote protection or a tested restore', async () => {
    render(<BackupHealthCard />);
    await screen.findByText('Verified local snapshot available');
    expect(screen.getByText(/No off-device backup is verified/)).toBeInTheDocument();
    expect(screen.getByText(/does not rehearse a restore/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith('/v1/local-backups/run', { method: 'POST' })
    );
  });
  it('exposes stale snapshots and reports failures with a retry control', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ ...healthy, stale: true });
    render(<BackupHealthCard />);
    await screen.findByText(/over two hours old/);
    vi.mocked(apiRequest).mockRejectedValue(new Error('Service offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Service offline');
    expect(screen.getByRole('button', { name: 'Check backup health' })).toBeEnabled();
  });
});
