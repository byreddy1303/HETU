import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DailyBriefCard from '@/components/settings/DailyBriefCard';
const config = {
  enabled: true,
  time: '09:00',
  timezone: 'Asia/Kolkata',
  autoLaunch: true,
  autoLaunchSupported: true,
  autoLaunchInstalled: true,
  last_shown_on: null,
  last_error: null
};
const bridge = {
  platform: 'darwin',
  isElectron: true,
  getAppVersion: async () => 'test',
  getDailyBrief: vi.fn(),
  saveDailyBrief: vi.fn(),
  previewDailyBrief: vi.fn(),
  onBriefNavigate: () => () => {}
};
beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.electronAPI = bridge;
  bridge.getDailyBrief.mockResolvedValue(config);
  bridge.saveDailyBrief.mockResolvedValue(config);
  bridge.previewDailyBrief.mockResolvedValue({ shown: true });
});
afterEach(() => {
  delete window.electronAPI;
});
describe('native daily brief settings', () => {
  it('shows the requested 9AM India schedule and can save or preview it', async () => {
    render(<DailyBriefCard />);
    expect(await screen.findByLabelText('Daily time (India)')).toHaveValue('09:00');
    expect(screen.getByText(/macOS daily launch is installed/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Daily time (India)'), { target: { value: '10:15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save daily brief' }));
    await waitFor(() =>
      expect(bridge.saveDailyBrief).toHaveBeenCalledWith({
        enabled: true,
        autoLaunch: true,
        time: '10:15'
      })
    );
    await screen.findByText('Daily desktop brief settings saved.');
    fireEvent.click(screen.getByRole('button', { name: 'Preview today’s brief' }));
    await waitFor(() => expect(bridge.previewDailyBrief).toHaveBeenCalledOnce());
  });
  it('reports exam deferral and delivery failures', async () => {
    bridge.previewDailyBrief.mockResolvedValue({ shown: false, held: true });
    render(<DailyBriefCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Preview today’s brief' }));
    await screen.findByText(/will wait until the active exam is finished/);
    bridge.previewDailyBrief.mockRejectedValue(new Error('Agenda unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'Preview today’s brief' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Agenda unavailable');
  });
});
