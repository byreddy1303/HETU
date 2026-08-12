import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BuddyMessageRow } from '@/types';
import BuddyChat from '@/components/buddy/BuddyChat';

const mocks = vi.hoisted(() => ({
  initialMessages: [] as BuddyMessageRow[],
  insert: vi.fn(),
  update: vi.fn(),
  touchActiveBuddy: vi.fn(),
  realtimeInsert: null as ((payload: { new: BuddyMessageRow }) => void) | null
}));

vi.mock('@/stores/buddyPresence', () => ({
  useBuddyPresenceStore: (
    selector: (state: { onlineUsersByBuddy: Record<string, string[]> }) => unknown
  ) => selector({ onlineUsersByBuddy: {} })
}));

vi.mock('@/lib/buddyNotifications', () => ({
  notifyBuddyMessage: vi.fn(),
  touchActiveBuddy: mocks.touchActiveBuddy
}));

vi.mock('@/lib/db', () => ({
  db: {
    questions: {
      where: () => ({ equals: () => ({ toArray: async () => [] }) })
    }
  }
}));

vi.mock('@/lib/supabase', () => {
  const makeBuilder = () => {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = chain;
    builder.eq = chain;
    builder.neq = chain;
    builder.is = chain;
    builder.lt = chain;
    builder.order = chain;
    builder.update = (value: unknown) => {
      mocks.update(value);
      return builder;
    };
    builder.insert = async (value: unknown) => {
      mocks.insert(value);
      return { error: null };
    };
    builder.limit = async () => ({ data: mocks.initialMessages, error: null });
    builder.in = async () => ({ error: null });
    return builder;
  };

  const channel: Record<string, unknown> = {};
  channel.on = (event: string, config: { event?: string }, callback: unknown) => {
    if (event === 'postgres_changes' && config.event === 'INSERT') {
      mocks.realtimeInsert = callback as (payload: { new: BuddyMessageRow }) => void;
    }
    return channel;
  };
  channel.subscribe = (callback: (status: string) => void) => {
    queueMicrotask(() => callback('SUBSCRIBED'));
    return channel;
  };
  channel.send = async () => 'ok';

  return {
    supabase: {
      from: () => makeBuilder(),
      channel: () => channel,
      removeChannel: async () => undefined
    }
  };
});

const peer = {
  id: 'peer-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  username: 'ada'
};

function message(overrides: Partial<BuddyMessageRow> = {}): BuddyMessageRow {
  return {
    id: 'message-1',
    buddy_id: 'buddy-1',
    sender_id: 'me-1',
    kind: 'text',
    body: 'Work through the invariant first.',
    question_ref: null,
    created_at: '2026-08-12T08:00:00.000Z',
    read_at: null,
    ...overrides
  };
}

function setPointer(coarse: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(pointer: coarse)' ? coarse : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  });
}

beforeEach(() => {
  mocks.initialMessages = [];
  mocks.insert.mockReset();
  mocks.update.mockReset();
  mocks.touchActiveBuddy.mockReset();
  mocks.touchActiveBuddy.mockResolvedValue(undefined);
  mocks.realtimeInsert = null;
  setPointer(false);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: vi.fn()
  });
});

afterEach(() => cleanup());

describe('Buddy chat UI', () => {
  it('keeps one composer share control and grows the message field', async () => {
    render(
      <BuddyChat buddyId="buddy-1" meId="me-1" peer={peer} isVisible onBack={() => undefined} />
    );

    await screen.findByText('Open the study desk');
    expect(screen.getAllByRole('button', { name: 'Share a question' })).toHaveLength(1);

    const textarea = screen.getByRole('textbox', { name: 'Message Ada' });
    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 96 });
    fireEvent.change(textarea, { target: { value: 'Line one\nLine two\nLine three' } });
    expect(textarea).toHaveStyle({ height: '96px' });
  });

  it('uses Enter to send on desktop but preserves newlines on coarse pointers', async () => {
    const first = render(<BuddyChat buddyId="buddy-1" meId="me-1" peer={peer} isVisible />);
    const desktopInput = await screen.findByRole('textbox', { name: 'Message Ada' });
    fireEvent.change(desktopInput, { target: { value: 'Desktop send' } });
    fireEvent.keyDown(desktopInput, { key: 'Enter' });
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledTimes(1));

    first.unmount();
    mocks.insert.mockReset();
    setPointer(true);
    render(<BuddyChat buddyId="buddy-1" meId="me-1" peer={peer} isVisible />);
    const mobileInput = await screen.findByRole('textbox', { name: 'Message Ada' });
    fireEvent.change(mobileInput, { target: { value: 'Mobile newline' } });
    fireEvent.keyDown(mobileInput, { key: 'Enter' });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('does not mark incoming messages read while the conversation is hidden', async () => {
    mocks.initialMessages = [message({ sender_id: 'peer-1', body: 'Are you there?' })];
    render(<BuddyChat buddyId="buddy-1" meId="me-1" peer={peer} isVisible={false} />);

    await screen.findByText('Are you there?');
    await waitFor(() => expect(mocks.touchActiveBuddy).toHaveBeenCalledWith(null));
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('offers a jump-to-latest control when the reader scrolls away', async () => {
    mocks.initialMessages = [message()];
    const { container } = render(<BuddyChat buddyId="buddy-1" meId="me-1" peer={peer} isVisible />);
    await screen.findByText('Work through the invariant first.');

    const list = container.querySelector('.native-chat-messages') as HTMLDivElement;
    Object.defineProperties(list, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 300 },
      scrollTop: { configurable: true, writable: true, value: 0 }
    });
    fireEvent.scroll(list);

    expect(
      await screen.findByRole('button', { name: 'Jump to latest message' })
    ).toBeInTheDocument();

    act(() => {
      mocks.realtimeInsert?.({
        new: message({
          id: 'message-2',
          sender_id: 'peer-1',
          body: 'New message below',
          created_at: '2026-08-12T08:01:00.000Z'
        })
      });
    });
    expect(
      await screen.findByRole('button', { name: 'Jump to 1 new message' })
    ).toBeInTheDocument();
  });
});
