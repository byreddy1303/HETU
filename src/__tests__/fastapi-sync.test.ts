import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let api: typeof import('@/lib/fastapi-client');
const fetchMock = vi.fn();
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv('VITE_BACKEND', 'fastapi'); vi.stubEnv('VITE_API_URL', '/api');
  vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_synthetic');
  vi.stubGlobal('fetch', async (...args: unknown[]) => (await fetchMock(...args)).clone());
  fetchMock.mockReset().mockImplementation(async () => Response.json({ data: [] }));
  api = await import('@/lib/fastapi-client');
  api.configureClerkRuntime({ loaded: true, user: { id: 'user_a' }, getToken: async () => 'token', signOut: async () => {} });
});
afterEach(() => { api.resetClerkRuntime(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('existing data facade through the FastAPI boundary', () => {
  it('hydrates, writes through, and preserves cached data when the server refuses writes or reads', async () => {
    const { hydrateTables, table } = await import('@/lib/db');
    const { writeLocal, deleteLocal } = await import('@/lib/sync');
    fetchMock.mockResolvedValue(Response.json({ data: [{ id: 's1', user_id: 'user_a', subject: 'Algorithms', outcome: 'M' }] }));
    await hydrateTables('user_a', ['sessions']);
    expect((await table('sessions').get('s1'))?.outcome).toBe('M');
    fetchMock.mockResolvedValue(Response.json({ data: [] }));
    await writeLocal('sessions', { id: 's1', user_id: 'user_a', subject: 'Algorithms', outcome: 'R' });
    expect(fetchMock.mock.lastCall![0]).toBe('/api/v1/compat/tables/sessions/upsert');
    expect(JSON.parse(fetchMock.mock.lastCall![1].body).values[0]).not.toHaveProperty('sync_status');
    expect((await table('sessions').get('s1'))?.outcome).toBe('R');
    fetchMock.mockResolvedValue(Response.json({ detail: 'revision conflict' }, { status: 409 }));
    await expect(writeLocal('sessions', { id: 's1', user_id: 'user_a', outcome: 'X' })).rejects.toThrow('revision conflict');
    await expect(deleteLocal('sessions', 's1')).rejects.toThrow('revision conflict');
    await expect(hydrateTables('user_a', ['sessions'])).rejects.toThrow('revision conflict');
    expect((await table('sessions').get('s1'))?.outcome).toBe('R');
  });

  it('loads all image history pages and preserves the previous cache if a later page fails', async () => {
    const { hydrateTables, table } = await import('@/lib/db');
    const first = Array.from({ length: 10 }, (_, n) => ({ id: `q${n}`, user_id: 'user_a' }));
    fetchMock.mockResolvedValueOnce(Response.json({ data: first }))
      .mockResolvedValueOnce(Response.json({ data: [{ id: 'q10', user_id: 'user_a' }] }));
    await hydrateTables('user_a', ['questions']);
    expect(await table('questions').count()).toBe(11);
    expect(fetchMock.mock.calls.map((call) => JSON.parse(call[1].body).offset)).toEqual([0, 10]);
    fetchMock.mockReset().mockResolvedValueOnce(Response.json({ data: first }))
      .mockResolvedValueOnce(Response.json({ detail: 'offline' }, { status: 503 }));
    await expect(hydrateTables('user_a', ['questions'])).rejects.toThrow('offline');
    expect(await table('questions').count()).toBe(11);
  });

  it('never forwards Clerk tokens or PIN credentials to Supabase edge endpoints', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://legacy.example');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'legacy-key');
    const edge = await import('@/lib/edge');
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockImplementation(async () => Response.json({ ok: true }));
    await edge.requestAccess({ name: 'Alex', email: 'alex@example.com', purpose: 'study' });
    expect(fetchMock.mock.lastCall![0]).toBe('/api/v1/access/request');
    expect(fetchMock.mock.lastCall![1].headers.has('Authorization')).toBe(false);
    await edge.approveRequest('r1');
    expect(fetchMock.mock.lastCall![0]).toBe('/api/v1/access/r1/approve');
    expect(fetchMock.mock.lastCall![1].headers.get('Authorization')).toBe('Bearer token');
  });
});
