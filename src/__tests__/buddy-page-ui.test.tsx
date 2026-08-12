import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Buddy from '@/pages/Buddy';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ userId: 'me-1', sandbox: false })
}));

vi.mock('@/stores/ui', () => ({
  useUiStore: (selector: (state: { pushToast: () => void }) => unknown) =>
    selector({ pushToast: vi.fn() })
}));

vi.mock('@/components/buddy/BuddyChat', () => ({
  default: ({ onBack }: { onBack?: () => void }) => (
    <section aria-label="Open buddy chat">
      <button type="button" onClick={onBack}>
        Back to chats
      </button>
    </section>
  )
}));

vi.mock('@/lib/supabase', () => {
  const buddy = {
    id: 'buddy-1',
    user_a: 'me-1',
    user_b: 'peer-1',
    status: 'active',
    created_at: '2026-08-12T08:00:00.000Z',
    requested_by: 'me-1',
    responded_at: '2026-08-12T08:01:00.000Z',
    decline_reason: null
  };
  const peer = {
    id: 'peer-1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    username: 'ada'
  };
  const channel: Record<string, unknown> = {};
  channel.on = () => channel;
  channel.subscribe = () => channel;

  return {
    supabaseConfigured: true,
    supabase: {
      from: (table: string) => {
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        builder.select = chain;
        builder.or = chain;
        builder.eq = chain;
        builder.neq = chain;
        builder.order = table === 'buddies' ? async () => ({ data: [buddy], error: null }) : chain;
        builder.limit = async () => ({ data: [], error: null });
        builder.is = async () => ({ count: 0, error: null });
        return builder;
      },
      rpc: async (name: string) =>
        name === 'list_buddy_peers' ? { data: [peer], error: null } : { data: null, error: null },
      channel: () => channel,
      removeChannel: async () => undefined
    }
  };
});

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}

beforeEach(() => {
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

afterEach(() => cleanup());

describe('Buddy mobile navigation', () => {
  it('uses the URL for chat navigation and lets native Back return to the list', async () => {
    render(
      <MemoryRouter initialEntries={['/buddy']}>
        <Routes>
          <Route
            path="/buddy"
            element={
              <>
                <Buddy />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: /Ada Lovelace/i }));
    expect(await screen.findByRole('region', { name: 'Open buddy chat' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/buddy?chat=buddy-1');

    const nativeBack = new CustomEvent('air:native-back', { cancelable: true });
    fireEvent(window, nativeBack);

    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Open buddy chat' })).toBeNull()
    );
    expect(nativeBack.defaultPrevented).toBe(true);
    expect(screen.getByTestId('location')).toHaveTextContent('/buddy');
    expect(screen.getByTestId('location')).not.toHaveTextContent('?chat=');
  });
});
