import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Nav from '@/components/layout/Nav';
import MobileTabs from '@/components/layout/MobileTabs';
import { db } from '@/lib/db';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    status: 'signed_in',
    userId: '00000000-0000-4000-8000-000000000001',
    sandbox: true,
    user: null,
    profile: null
  })
}));

vi.mock('@/lib/native', () => ({ haptic: vi.fn() }));

describe('PYQ layout navigation', () => {
  beforeEach(async () => {
    await db.sessions.clear();
  });

  it('keeps PYQ practice in the desktop primary group and Quick capture in Analysis', () => {
    render(
      <MemoryRouter>
        <Nav />
      </MemoryRouter>
    );

    const navigation = screen.getByRole('navigation');
    const analysisHeading = within(navigation).getByText('Analysis');
    const analysisGroup = analysisHeading.parentElement;
    expect(analysisGroup).not.toBeNull();
    expect(within(analysisGroup!).getByRole('link', { name: 'Quick capture' })).toHaveAttribute(
      'href',
      '/capture'
    );
    expect(within(analysisGroup!).queryByRole('link', { name: 'PYQ practice' })).toBeNull();

    const pyqLink = within(navigation).getByRole('link', { name: 'PYQ practice' });
    expect(pyqLink).toHaveAttribute('href', '/pyq');
    expect(
      pyqLink.compareDocumentPosition(analysisHeading) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('places PYQ practice under Study and Quick capture under Practice on mobile', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MobileTabs />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: 'More sections' }));
    const dialog = await screen.findByRole('dialog', { name: 'All sections' });
    const studyGroup = within(dialog).getByText('Study').parentElement;
    const practiceGroup = within(dialog).getByText('Practice').parentElement;
    expect(studyGroup).not.toBeNull();
    expect(practiceGroup).not.toBeNull();
    expect(within(studyGroup!).getByRole('link', { name: 'PYQ practice' })).toHaveAttribute(
      'href',
      '/pyq'
    );
    expect(within(studyGroup!).queryByRole('link', { name: 'Quick capture' })).toBeNull();
    expect(within(practiceGroup!).getByRole('link', { name: 'Quick capture' })).toHaveAttribute(
      'href',
      '/capture'
    );
    expect(within(practiceGroup!).queryByRole('link', { name: 'PYQ practice' })).toBeNull();
  });
});
