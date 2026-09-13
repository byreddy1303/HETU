import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { db } from '@/lib/db';
import { useUiStore } from '@/stores/ui';

const USER = '00000000-0000-4000-8000-000000000001';

const authFixture = vi.hoisted(() => ({ username: null as string | null }));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    status: 'signed_in',
    userId: USER,
    sandbox: true,
    user: null,
    profile: authFixture.username
      ? {
          id: USER,
          name: 'Test Learner',
          email: 'learner@example.test',
          username: authFixture.username,
          exam_date: '2027-02-06',
          target_rank: 100,
          sadhana_practice: false,
          timezone: 'Asia/Kolkata',
          created_at: '2026-07-01T00:00:00.000Z',
          welcome_seen_at: '2026-07-01T00:00:00.000Z',
          phone_e164: null,
          digest_email_enabled: false,
          digest_whatsapp_enabled: false,
          digest_hour_local: 6,
          digest_minute_local: 0,
          wa_opted_in_at: null,
          last_digest_sent_on: null,
          buddy_notification_preview_enabled: true
        }
      : null
  })
}));

vi.mock('@/components/dashboard/WelcomeOverlay', () => ({ default: () => null }));
vi.mock('@/lib/pyq', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/pyq')>();
  return { ...original, loadPyqQuestionByUid: vi.fn().mockResolvedValue(null) };
});
vi.mock('@/lib/image', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/image')>();
  return { ...original, captureElementToDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,') };
});

import Dashboard from '@/pages/Dashboard';

beforeEach(async () => {
  authFixture.username = null;
  await db.sessions.clear();
  await db.questions.clear();
  await db.pyq_attempts.clear();
  await db.reattempts.clear();
  await db.formulas.clear();
  await db.weekly_reviews.clear();
  useUiStore.setState({ navCollapsed: false });
});

describe('Dashboard core-only minimal view', () => {
  it('shows the full dashboard for a standard account', () => {
    authFixture.username = 'kalyan';
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    // Hero present - check for action button and hero section
    expect(screen.getByText('Open Do now')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /A clear queue/ })).toBeInTheDocument();

    // Launchpad has all three tiles
    expect(screen.getByRole('button', { name: /Practice studio/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Return & recall/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Find a connection/ })).toBeInTheDocument();

    // Full sections present
    expect(screen.getByText('Mistake surface')).toBeInTheDocument();
    expect(screen.getByText('Practice pulse')).toBeInTheDocument();
    expect(screen.getByText('Weekly focus')).toBeInTheDocument();
    expect(screen.getByText('Last session')).toBeInTheDocument();
  });

  it('collapses to minimal study-focused dashboard for core-only account', () => {
    authFixture.username = 'ganirishivardhangmailcom';
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    // Hero present (core user still gets greeting + Do now)
    expect(screen.getByText('Open Do now')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /A clear queue/ })).toBeInTheDocument();

    // Launchpad ONLY has Practice studio
    expect(screen.getByRole('button', { name: /Practice studio/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Return & recall/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Find a connection/ })).toBeNull();

    // Practice pulse present (questions today + sessions this week + PYQ bank)
    expect(screen.getByText('Practice pulse')).toBeInTheDocument();
    expect(screen.getByText('Questions today')).toBeInTheDocument();
    expect(screen.getByText('Sessions this week')).toBeInTheDocument();
    expect(screen.getByText('PYQ practice bank')).toBeInTheDocument();

    // Reflect/Library-driven sections REMOVED
    expect(screen.queryByText('Mistake surface')).toBeNull();
    expect(screen.queryByText('Weekly focus')).toBeNull();
    expect(screen.queryByText('Last session')).toBeNull();
    expect(screen.queryByText('GATE prep tip')).toBeNull();
  });

  it('core-only rishi account gets the same minimal dashboard', () => {
    authFixture.username = 'rishi';
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    expect(screen.getByText('Open Do now')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /A clear queue/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Practice studio/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Return & recall/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Find a connection/ })).toBeNull();
    expect(screen.queryByText('Mistake surface')).toBeNull();
    expect(screen.queryByText('Weekly focus')).toBeNull();
    expect(screen.queryByText('Last session')).toBeNull();
    expect(screen.queryByText('GATE prep tip')).toBeNull();
  });
});