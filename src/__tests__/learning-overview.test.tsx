import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LearningOverview from '@/components/dashboard/LearningOverview';

const shared = vi.hoisted(() => vi.fn());
vi.mock('@/lib/backend-config', () => ({ backendConfig: { fastapi: true, isLocal: true } }));
vi.mock('@/components/dashboard/TodayActions', () => ({
  default: (props: unknown) => {
    shared(props);
    return <section aria-label="Today's study queue">Shared daily decision</section>;
  }
}));
const props = {
  userId: 'owner',
  name: 'Kalyan',
  today: '2026-10-29',
  timeZone: 'Asia/Kolkata',
  coreOnly: false,
  showCountdown: true,
  daysLeft: 100,
  resumeSession: null
};
function mount(extra = {}) {
  return render(
    <MemoryRouter>
      <LearningOverview {...props} {...extra} />
    </MemoryRouter>
  );
}
beforeEach(() => {
  cleanup();
  shared.mockClear();
});
describe('local dashboard daily entry point', () => {
  it('uses the same daily decision as Do now rather than another recommendation', () => {
    mount();
    expect(screen.getByRole('region', { name: "Today's study queue" })).toBeInTheDocument();
    expect(shared).toHaveBeenCalledWith({ userId: 'owner', today: '2026-10-29', compact: true });
    expect(screen.getByRole('link', { name: 'Open Do now' })).toHaveAttribute('href', '/today');
  });
  it('keeps the minimal core-only profile without mounting advanced data requests', () => {
    mount({ coreOnly: true });
    expect(screen.getByRole('link', { name: 'Open Do now' })).toBeInTheDocument();
    expect(shared).not.toHaveBeenCalled();
  });
  it('does not mount a personal queue without an account identity', () => {
    mount({ userId: null });
    expect(shared).not.toHaveBeenCalled();
  });
});
