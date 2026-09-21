import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Nav from '@/components/layout/Nav';
import MobileTabs from '@/components/layout/MobileTabs';
import Shell from '@/components/layout/Shell';
import { useUiStore } from '@/stores/ui';
import { db } from '@/lib/db';

const authFixture = vi.hoisted(() => ({ username: null as string | null }));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    status: 'signed_in',
    userId: '00000000-0000-4000-8000-000000000001',
    sandbox: true,
    user: null,
    profile: authFixture.username
      ? {
          id: '00000000-0000-4000-8000-000000000001',
          username: authFixture.username,
          name: authFixture.username,
          timezone: 'Asia/Kolkata'
        }
      : null
  })
}));

vi.mock('@/lib/native', () => ({ haptic: vi.fn() }));

beforeEach(() => {
  authFixture.username = null;
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
});

describe('PYQ layout navigation', () => {
  beforeEach(async () => {
    await db.sessions.clear();
    useUiStore.setState({ navCollapsed: false });
  });

  it('keeps PYQ practice in the desktop Study group and merges logging into Manual logging', () => {
    render(
      <MemoryRouter>
        <Nav />
      </MemoryRouter>
    );

    const navigation = screen.getByRole('navigation');
    const studyHeading = within(navigation).getByText('Study');
    const studyGroup = studyHeading.parentElement;
    expect(studyGroup).not.toBeNull();

    const pyqLink = within(navigation).getByRole('link', { name: 'PYQ practice' });
    expect(pyqLink).toHaveAttribute('href', '/pyq');
    expect(studyGroup).toContainElement(pyqLink);

    expect(within(navigation).getByRole('link', { name: 'Manual logging' })).toHaveAttribute(
      'href',
      '/log'
    );
    expect(within(navigation).queryByRole('link', { name: 'Quick capture' })).toBeNull();
    expect(within(navigation).queryByRole('link', { name: 'Session' })).toBeNull();
    expect(within(navigation).queryByRole('link', { name: 'Log' })).toBeNull();
  });

  it('places PYQ practice under Study and drops Quick capture on mobile', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MobileTabs />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: 'More sections' }));
    const dialog = await screen.findByRole('dialog', { name: 'All sections' });
    const studyGroup = within(dialog).getByText('Study').parentElement;
    expect(studyGroup).not.toBeNull();
    expect(within(studyGroup!).getByRole('link', { name: 'PYQ practice' })).toHaveAttribute(
      'href',
      '/pyq'
    );
    expect(within(dialog).queryByText('Practice')).toBeNull();
    expect(within(dialog).queryByRole('link', { name: 'Quick capture' })).toBeNull();

    expect(screen.getByRole('link', { name: 'Manual logging' })).toHaveAttribute('href', '/log');
    expect(screen.queryByRole('link', { name: 'Quick capture' })).toBeNull();
  });

  it.each([null, 'kalyan', 'ganirishivardhangmailcom'])(
    'collapses Reflect and Library into dropdowns for account %s, openable on demand',
    async (username) => {
      authFixture.username = username;
      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={['/today']}>
          <Nav />
        </MemoryRouter>
      );

      const navigation = screen.getByRole('navigation');
      expect(within(navigation).queryByRole('link', { name: 'Journal' })).toBeNull();
      expect(within(navigation).queryByRole('link', { name: 'Formulas' })).toBeNull();

      const reflectToggle = within(navigation).getByRole('button', { name: 'Reflect' });
      expect(reflectToggle).toHaveAttribute('aria-expanded', 'false');
      await user.click(reflectToggle);
      expect(reflectToggle).toHaveAttribute('aria-expanded', 'true');
      expect(within(navigation).getByRole('link', { name: 'Journal' })).toHaveAttribute(
        'href',
        '/journal'
      );

      const libraryToggle = within(navigation).getByRole('button', { name: 'Library' });
      expect(libraryToggle).toHaveAttribute('aria-expanded', 'false');
      await user.click(libraryToggle);
      expect(within(navigation).getByRole('link', { name: 'Formulas' })).toHaveAttribute(
        'href',
        '/formulas'
      );
      await user.click(reflectToggle);
      await user.click(libraryToggle);
      expect(within(navigation).queryByRole('link', { name: 'Journal' })).toBeNull();
      expect(within(navigation).queryByRole('link', { name: 'Formulas' })).toBeNull();
    }
  );

  it('automatically opens a collapsed group for the current route and closes it again', async () => {
    authFixture.username = 'kalyan';
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/patterns']}>
        <Nav />
      </MemoryRouter>
    );

    const navigation = screen.getByRole('navigation');
    const reflectToggle = within(navigation).getByRole('button', { name: 'Reflect' });
    expect(reflectToggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(navigation).getByRole('link', { name: 'Patterns' })).toHaveAttribute(
      'href',
      '/patterns'
    );

    await user.click(reflectToggle);
    expect(reflectToggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(navigation).queryByRole('link', { name: 'Patterns' })).toBeNull();
  });

  it('allows collapsing and expanding the side menu on desktop', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Shell />
      </MemoryRouter>
    );

    const collapseButton = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(collapseButton).toBeInTheDocument();

    await user.click(collapseButton);
    expect(useUiStore.getState().navCollapsed).toBe(true);

    const expandButton = await screen.findByRole('button', { name: 'Expand sidebar' });
    expect(expandButton).toBeInTheDocument();

    await user.click(expandButton);
    expect(useUiStore.getState().navCollapsed).toBe(false);
  });

  it('toggles the sidebar via Ctrl+B shortcut', () => {
    render(
      <MemoryRouter>
        <Shell />
      </MemoryRouter>
    );

    expect(useUiStore.getState().navCollapsed).toBe(false);

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    expect(useUiStore.getState().navCollapsed).toBe(true);

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    expect(useUiStore.getState().navCollapsed).toBe(false);
  });
});
