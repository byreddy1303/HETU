import { afterEach, describe, expect, it, vi } from 'vitest';

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  onopen?: () => void;
  onclose?: () => void;
  onmessage?: (event: { data: string }) => void;
  send = vi.fn();
  constructor() {
    Socket.instances.push(this);
  }
  open() {
    this.readyState = Socket.OPEN;
    this.onopen?.();
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  message(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
}

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('local database changes received while the app stays open', () => {
  it('reconciles an MCP edit through the existing socket without a focus or reconnect event', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubEnv('VITE_BACKEND', 'fastapi');
    vi.stubEnv('VITE_API_URL', '/api');
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_synthetic');
    Socket.instances = [];
    vi.stubGlobal('WebSocket', Socket);
    const user = 'local_user';
    let formula = {
      id: 'formula-1',
      user_id: user,
      version: 1,
      name: 'Bayes',
      subject: 'Probability',
      expression: 'P(H|E)'
    };
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const query = JSON.parse(init.body as string);
      if (!url.includes('/formulas/')) return Response.json({ data: [] });
      return Response.json({
        data:
          query.columns === 'id,version'
            ? [{ id: formula.id, version: formula.version }]
            : [{ ...formula }]
      });
    });
    const api = await import('@/lib/fastapi-client');
    api.configureClerkRuntime({
      loaded: true,
      user: { id: user },
      getToken: async () => 'local-session',
      signOut: async () => {}
    });
    const repository = await import('@/lib/db');
    const sync = await import('@/lib/sync');
    cleanup = () => {
      sync.stopSync();
      api.resetClerkRuntime();
    };
    sync.initSync(user);
    await sync.awaitInitialPull(user);
    await vi.advanceTimersByTimeAsync(0);
    const socket = Socket.instances[0];
    expect(socket).toBeDefined();
    socket.open();
    await vi.advanceTimersByTimeAsync(350);
    await sync.awaitInitialPull(user);
    expect(await repository.db.formulas.get(formula.id)).toMatchObject({ version: 1 });
    const changed = vi.fn();
    const domainChanged = vi.fn();
    window.addEventListener('hetu:workspace-changed', domainChanged);
    const unsubscribe = repository.subscribeDb(changed, ['formulas']);

    // The Python SQLite watcher emits this exact frame after an external commit.
    formula = { ...formula, version: 2, expression: 'P(E|H)P(H)/P(E)' };
    socket.message({
      type: 'broadcast',
      topic: `user-sync:${user}`,
      event: 'sync_mutation',
      payload: { sourceDeviceId: 'local-sqlite' }
    });
    await vi.advanceTimersByTimeAsync(350);
    await sync.awaitInitialPull(user);

    expect(await repository.db.formulas.get(formula.id)).toMatchObject({
      version: 2,
      expression: 'P(E|H)P(H)/P(E)'
    });
    expect(changed).toHaveBeenCalled();
    expect(domainChanged).toHaveBeenCalledOnce();
    expect(Socket.instances).toHaveLength(1);
    expect(socket.readyState).toBe(Socket.OPEN);
    unsubscribe();
    window.removeEventListener('hetu:workspace-changed', domainChanged);
  });
});
