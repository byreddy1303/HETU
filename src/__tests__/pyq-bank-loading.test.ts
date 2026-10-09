import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const subject = {
  slug: 'algorithms',
  label: 'Algorithms',
  count: 0,
  file: '/api/v1/pyq/subjects/algorithms',
  topics: []
};
beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});
afterEach(() => vi.useRealTimers());
describe('PYQ bank loading recovery', () => {
  it('retries a failed manifest instead of caching the rejection', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(
        Response.json({ subjects: [], books: [{ slug: 'gate-cse', subjects: [] }] })
      );
    const { loadPyqManifest } = await import('@/lib/pyq');
    await expect(loadPyqManifest()).rejects.toThrow('offline');
    await expect(loadPyqManifest()).resolves.toMatchObject({ defaultBookSlug: 'gate-cse' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('rejects stale subject data and permits a fresh retry', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ bankVersion: 'old', questions: [] }))
      .mockResolvedValueOnce(Response.json({ bankVersion: 'current', questions: [] }));
    const { loadPyqQuestions } = await import('@/lib/pyq');
    await expect(loadPyqQuestions([subject], 'current')).rejects.toThrow('updated');
    await expect(loadPyqQuestions([subject], 'current')).resolves.toEqual([]);
  });
  it('aborts an unresponsive bank request and releases the cached promise', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError'))
            );
          })
      )
      .mockResolvedValueOnce(Response.json({ bankVersion: 'current', questions: [] }));
    const { loadPyqQuestions, PYQ_BANK_REQUEST_TIMEOUT_MS } = await import('@/lib/pyq');
    const failed = expect(loadPyqQuestions([subject], 'current')).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(PYQ_BANK_REQUEST_TIMEOUT_MS);
    await failed;
    await expect(loadPyqQuestions([subject], 'current')).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});


// Exercise the Python catalog contract while keeping domain writes in fixture RAM.
vi.mock('@/lib/backend-config', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/backend-config')>(),
  backendConfig: { backend: 'fastapi', fastapi: true, error: null, apiUrl: '/api', clerkKey: 'pk_test_fixture' }
}));
vi.mock('@/lib/api-client', async () => ({
  apiConfigured: false,
  apiClient: (await import('@/lib/fastapi-client')).fastapiClient
}));
beforeEach(async () => {
  const { configureClerkRuntime } = await import('@/lib/fastapi-client');
  configureClerkRuntime({ loaded: true, user: { id: 'test-catalog-reader' },
    getToken: async () => 'test-session', signOut: async () => {} });
});
