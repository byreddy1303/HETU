import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
let api: typeof import('@/lib/fastapi-client');
const token = vi.fn(async () => 'clerk-token');

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv('VITE_BACKEND', 'fastapi');
  vi.stubEnv('VITE_API_URL', '/api');
  vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_synthetic');
  vi.stubGlobal('fetch', async (...args: unknown[]) => (await fetchMock(...args)).clone());
  fetchMock.mockReset().mockResolvedValue(Response.json({ data: [], count: 0 }));
  token.mockReset().mockResolvedValue('clerk-token');
  api = await import('@/lib/fastapi-client');
  api.configureClerkRuntime({ loaded: true, user: { id: 'user_a' }, getToken: token, signOut: async () => {} });
});
afterEach(() => { vi.useRealTimers(); api.resetClerkRuntime(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function body() { return JSON.parse(fetchMock.mock.lastCall![1].body); }

describe('FastAPI compatibility boundary', () => {
  it('keeps query filters, projections, ordering, inclusive ranges and refreshed bearer tokens', async () => {
    fetchMock.mockResolvedValue(Response.json({ data: [{ id: 's1' }], count: 9 }));
    const result = await api.fastapiClient.from('sessions').select('id', { count: 'exact' })
      .eq('user_id', 'user_a').neq('id', 's2').in('subject', ['OS', 'DB'])
      .gt('elapsed_sec', 1).gte('elapsed_sec', 2).lt('elapsed_sec', 90).lte('elapsed_sec', 89)
      .is('deleted_at', null).or('user_a.eq.user_a,user_b.eq.user_a')
      .order('id', { ascending: false }).range(3, 5);
    expect(result).toEqual({ data: [{ id: 's1' }], count: 9, error: null });
    expect(fetchMock.mock.lastCall![0]).toBe('/api/v1/compat/tables/sessions/query');
    expect(body()).toMatchObject({ columns: 'id', limit: 3, offset: 3, count: 'exact',
      orders: [{ field: 'id', ascending: false }], or_filters: [{ field: 'user_a', op: 'eq', value: 'user_a' }, { field: 'user_b', op: 'eq', value: 'user_a' }] });
    expect(body().filters).toHaveLength(8);
    expect(fetchMock.mock.lastCall![1].headers.get('Authorization')).toBe('Bearer clerk-token');
    token.mockResolvedValue('rotated');
    await api.fastapiClient.from('users').select('id');
    expect(fetchMock.mock.lastCall![1].headers.get('Authorization')).toBe('Bearer rotated');
  });

  it('sends mutations without dropping rows, conflict keys or filters', async () => {
    await api.fastapiClient.from('sessions').upsert([{ id: 's1' }, { id: 's2' }], { onConflict: 'id' });
    expect(body()).toEqual({ values: [{ id: 's1' }, { id: 's2' }], filters: [], on_conflict: 'id', returning: false });
    await api.fastapiClient.from('sessions').update({ outcome: 'R' }).eq('id', 's1');
    expect(fetchMock.mock.lastCall![0]).toMatch(/\/update$/);
    expect(body().filters).toEqual([{ field: 'id', op: 'eq', value: 's1' }]);
    await api.fastapiClient.from('sessions').delete().eq('id', 's1');
    expect(fetchMock.mock.lastCall![0]).toMatch(/\/delete$/);
  });

  it('enforces single/maybeSingle for reads and mutation returning', async () => {
    expect((await api.fastapiClient.from('users').select().single()).error?.code).toBe('PGRST116');
    expect((await api.fastapiClient.from('users').select().maybeSingle()).data).toBeNull();
    fetchMock.mockResolvedValue(Response.json({ data: [{ id: 's1' }] }));
    expect((await api.fastapiClient.from('sessions').insert({ id: 's1' }).select().single()).data).toEqual({ id: 's1' });
    expect(body().returning).toBe(true);
    fetchMock.mockResolvedValue(Response.json({ data: [{ id: 's1' }, { id: 's2' }] }));
    expect((await api.fastapiClient.from('sessions').select().maybeSingle()).error?.code).toBe('PGRST116');
  });

  it('preserves head counts and RPC/function envelopes', async () => {
    fetchMock.mockResolvedValue(Response.json({ data: [], count: 7 }));
    expect(await api.fastapiClient.from('buddy_messages').select('id', { count: 'exact', head: true })).toEqual({ data: null, count: 7, error: null });
    fetchMock.mockResolvedValue(Response.json({ data: { revision: 8 } }));
    expect((await api.fastapiClient.rpc('apply_planner_day_plan_mutation', { expected_revision: 7 })).data).toEqual({ revision: 8 });
    expect(body()).toEqual({ arguments: { expected_revision: 7 } });
    await api.fastapiClient.functions.invoke('daily-digest', { body: { user_id: 'user_a' } });
    expect(body()).toEqual({ body: { user_id: 'user_a' } });
  });

  it.each([409, 428, 401, 503])('preserves HTTP %s as an error, never a successful empty result', async (status) => {
    fetchMock.mockResolvedValue(Response.json({ detail: { message: 'write refused', code: 'REVISION' } }, { status }));
    const result = await api.fastapiClient.from('sessions').upsert({ id: 's1' });
    expect(result).toMatchObject({ data: null, error: { message: 'write refused', status, code: 'REVISION' } });
  });

  it('rejects malformed responses, network errors, and unsupported filters', async () => {
    fetchMock.mockResolvedValue(new Response('<html>SPA fallback</html>'));
    expect((await api.fastapiClient.from('sessions').select()).error?.message).toMatch(/Invalid JSON/);
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect((await api.fastapiClient.from('sessions').upsert({ id: 's1' })).error?.message).toBe('Failed to fetch');
    fetchMock.mockClear();
    expect((await api.fastapiClient.from('sessions').delete().or('id.eq.s1,id.eq.s2')).error).not.toBeNull();
    expect((await api.fastapiClient.from('sessions').select().or('bad.expression')).error).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('waits for Clerk startup, respects unsubscribe, and never persists its token', async () => {
    api.resetClerkRuntime();
    const listener = vi.fn();
    const sub = api.fastapiClient.auth.onAuthStateChange(listener);
    sub.data.subscription.unsubscribe();
    let settled = false;
    const pending = api.fastapiClient.auth.getSession().then((value) => { settled = true; return value; });
    await Promise.resolve();
    expect(settled).toBe(false);
    api.configureClerkRuntime({ loaded: true, user: { id: 'user_a' }, getToken: token, signOut: async () => {} });
    expect((await pending).data.session?.user.id).toBe('user_a');
    expect(listener).not.toHaveBeenCalled();
    expect(Object.values(localStorage)).not.toContain('clerk-token');
  });

  it('does not make protected requests while signed out; public requests carry no bearer', async () => {
    api.configureClerkRuntime({ loaded: true, user: null, getToken: token, signOut: async () => {} });
    expect((await api.fastapiClient.from('users').select()).error?.message).toBe('Sign in first.');
    expect(fetchMock).not.toHaveBeenCalled();
    await api.apiRequest('/v1/access/request', { method: 'POST', body: '{}' }, { public: true });
    expect(fetchMock.mock.lastCall![1].headers.has('Authorization')).toBe(false);
  });

  it('discards responses from a previous account', async () => {
    let finish!: (value: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => { finish = resolve; }));
    const pending = api.fastapiClient.from('sessions').select().single();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    api.configureClerkRuntime({ loaded: true, user: { id: 'user_b' }, getToken: token, signOut: async () => {} });
    finish(Response.json({ data: [{ id: 'private-a' }] }));
    expect(await pending).toMatchObject({ data: null, error: { message: expect.stringContaining('stale response') } });
  });

  it('does not sign out on token failure; a failed Clerk signout preserves the session', async () => {
    const listener = vi.fn();
    api.fastapiClient.auth.onAuthStateChange(listener);
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
    listener.mockClear();
    token.mockRejectedValue(new Error('offline'));
    expect((await api.fastapiClient.auth.getSession()).error?.message).toBe('offline');
    expect(listener).not.toHaveBeenCalledWith('SIGNED_OUT', null);
    token.mockResolvedValue('clerk-token');
    api.configureClerkRuntime({ loaded: true, user: { id: 'user_a' }, getToken: token, signOut: async () => { throw new Error('try again'); } });
    expect((await api.fastapiClient.auth.signOut()).error?.message).toBe('try again');
    expect((await api.fastapiClient.auth.getSession()).data.session?.user.id).toBe('user_a');
  });
});


describe('bounded API requests', () => {
  it('releases a stalled write without retrying or reporting success', async () => {
    vi.useFakeTimers();
    fetchMock.mockReturnValue(new Promise(() => {}));
    const pending = api.fastapiClient.from('sessions').upsert({ id: 's1' }).single();
    await vi.advanceTimersByTimeAsync(api.API_REQUEST_TIMEOUT_MS);
    expect(await pending).toMatchObject({ data: null, error: { code: 'REQUEST_TIMEOUT' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.lastCall![1].signal.aborted).toBe(true);
  });

  it('times out token acquisition and never sends the write after the token arrives late', async () => {
    vi.useFakeTimers();
    let finish!: (value: string) => void;
    token.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const pending = api.fastapiClient.from('sessions').insert({ id: 's1' }).single();
    await vi.advanceTimersByTimeAsync(api.API_REQUEST_TIMEOUT_MS);
    expect(await pending).toMatchObject({ data: null, error: { code: 'REQUEST_TIMEOUT' } });
    finish('late-token');
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('bounds an uninitialized auth session and stalled response body', async () => {
    vi.useFakeTimers();
    api.resetClerkRuntime();
    const session = api.fastapiClient.auth.getSession();
    await vi.advanceTimersByTimeAsync(api.API_REQUEST_TIMEOUT_MS);
    expect(await session).toMatchObject({ data: { session: null }, error: { code: 'REQUEST_TIMEOUT' } });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: () => new Promise(() => {}) })));
    const pending = api.apiRequest('/v1/access/request', {}, { public: true });
    const rejected = expect(pending).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(api.API_REQUEST_TIMEOUT_MS);
    await rejected;
  });

  it('honors caller cancellation before auth is ready and never dispatches late', async () => {
    api.resetClerkRuntime();
    const controller = new AbortController();
    const pending = api.apiRequest('/v1/me', { signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    api.configureClerkRuntime({ loaded: true, user: { id: 'user_a' }, getToken: token, signOut: async () => {} });
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
