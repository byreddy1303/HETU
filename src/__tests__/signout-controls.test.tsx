import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import MobileTabs from '@/components/layout/MobileTabs';

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  pushToast: vi.fn(),
  setNavCollapsed: vi.fn()
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    status: 'signed_in',
    userId: '11111111-1111-4111-8111-111111111111',
    sandbox: false,
    user: { id: '11111111-1111-4111-8111-111111111111' },
    profile: { name: 'Learner' }
  })
}));

vi.mock('@/stores/auth', () => ({
  useAuthStore: (selector: (state: { signOut: typeof mocks.signOut }) => unknown) =>
    selector({ signOut: mocks.signOut })
}));

vi.mock('@/stores/session', () => ({
  useSessionStore: (selector: (state: { sessionId: null }) => unknown) =>
    selector({ sessionId: null })
}));

vi.mock('@/stores/ui', () => ({
  useUiStore: (
    selector: (state: {
      navCollapsed: boolean;
      setNavCollapsed: typeof mocks.setNavCollapsed;
      pushToast: typeof mocks.pushToast;
    }) => unknown
  ) =>
    selector({
      navCollapsed: false,
      setNavCollapsed: mocks.setNavCollapsed,
      pushToast: mocks.pushToast
    })
}));

vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => null }));
vi.mock('@/lib/native', () => ({ haptic: vi.fn() }));

describe('mobile sign-out controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    });
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute('open');
    };
  });

  it('turns a failed safe sign-out into a reliable explicit force action', async () => {
    const user = userEvent.setup();
    mocks.signOut
      .mockResolvedValueOnce({ error: 'The learning_events table is unavailable.' })
      .mockResolvedValueOnce({});
    const confirmSpy = vi.spyOn(window, 'confirm');

    render(
      <MemoryRouter>
        <MobileTabs />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: 'More sections' }));
    const dialog = await screen.findByRole('dialog', { name: 'All sections' });
    await user.click(within(dialog).getByRole('button', { name: 'Sign out' }));

    const forceButton = await within(dialog).findByRole('button', { name: 'Force sign out' });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenNthCalledWith(1, { force: false });
    expect(mocks.pushToast).toHaveBeenCalledWith(
      expect.stringContaining("Tap 'Force sign out'"),
      'danger'
    );

    await user.click(forceButton);
    expect(mocks.signOut).toHaveBeenNthCalledWith(2, { force: true });
  });

  it('ignores repeated taps while one sign-out request is still running', async () => {
    let finishSignOut: ((value: Record<string, never>) => void) | undefined;
    mocks.signOut.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSignOut = resolve;
        })
    );

    render(
      <MemoryRouter>
        <MobileTabs />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'More sections' }));
    const dialog = await screen.findByRole('dialog', { name: 'All sections' });
    const signOutButton = within(dialog).getByRole('button', { name: 'Sign out' });
    fireEvent.click(signOutButton);
    fireEvent.click(signOutButton);

    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    finishSignOut?.({});
    await waitFor(() => expect(signOutButton).toBeEnabled());
  });
});
