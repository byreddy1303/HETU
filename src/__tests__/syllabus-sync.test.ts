import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';

const USER = '11111111-1111-4111-8111-111111111111';
const fetchMock = vi.fn();
let api: typeof import('@/lib/fastapi-client');
let repository: typeof import('@/lib/db');
let progress: typeof import('@/stores/topic-progress');

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function row(id: string, topic = id) {
  return {
    id, user_id: USER, subject: 'Algorithms', topic,
    completed_at: '2026-10-11T01:00:00.000Z', updated_at: '2026-10-11T01:00:00.000Z'
  };
}

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv('VITE_BACKEND', 'fastapi');
  vi.stubEnv('VITE_API_URL', '/api');
  vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_synthetic');
  fetchMock.mockReset().mockImplementation(async () => Response.json({ data: [] }));
  vi.stubGlobal('fetch', async (...args: unknown[]) => (await fetchMock(...args)).clone());
  api = await import('@/lib/fastapi-client');
  api.configureClerkRuntime({
    loaded: true, user: { id: USER }, getToken: async () => 'test-token', signOut: async () => {}
  });
  repository = await import('@/lib/db');
  progress = await import('@/stores/topic-progress');
  (await import('@/lib/runtime-storage')).runtimeStorage.clear();
});

afterEach(() => {
  progress.resetTopicProgressMemory();
  api.resetClerkRuntime();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('syllabus saves through the authenticated API', () => {
  it('sends five independent checkbox saves immediately and survives a fresh database read', async () => {
    await progress.syncTopicProgressFromDb(USER);
    const pending: Array<{ gate: ReturnType<typeof deferred<Response>>; values: ReturnType<typeof row>[] }> = [];
    const server = new Map<string, ReturnType<typeof row>>();
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith('/query')) return Response.json({ data: [...server.values()] });
      const gate = deferred<Response>();
      const values = JSON.parse(init.body as string).values;
      pending.push({ gate, values });
      const response = await gate.promise;
      if (response.ok) for (const value of values) server.set(value.id, value);
      return response;
    });
    const ids = ['Sorting', 'Graphs', 'Greedy', 'Dynamic programming', 'Searching']
      .map((topic) => progress.topicProgressId('Algorithms', topic));
    const saves = ids.map((id) => progress.useTopicProgressStore.getState().setCompleted(USER, id, true));

    // All five UI values change before even one network response arrives.
    expect(Object.keys(progress.useTopicProgressStore.getState().byUser[USER])).toEqual(ids);
    await waitFor(() => expect(pending).toHaveLength(5));
    expect(await repository.db.topic_progress.count()).toBe(0);
    for (const item of [...pending].reverse()) item.gate.resolve(Response.json({ data: item.values }));
    await Promise.all(saves);
    expect(server.size).toBe(5);
    expect(Object.keys(progress.useTopicProgressStore.getState().pendingByUser[USER])).toHaveLength(0);

    await repository.clearLocalData();
    progress.resetTopicProgressMemory();
    await progress.syncTopicProgressFromDb(USER);
    expect(Object.keys(progress.useTopicProgressStore.getState().byUser[USER]).sort()).toEqual(ids.sort());
  });

  it('keeps a rapid untick visible while the earlier check is in flight, then deletes the saved row', async () => {
    await progress.syncTopicProgressFromDb(USER);
    const check = deferred<Response>();
    const uncheck = deferred<Response>();
    fetchMock.mockImplementation((url: string) => url.endsWith('/delete') ? uncheck.promise : check.promise);
    const id = progress.topicProgressId('Algorithms', 'Graphs');
    const first = progress.useTopicProgressStore.getState().setCompleted(USER, id, true);
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/upsert'))).toBe(true));
    const second = progress.useTopicProgressStore.getState().setCompleted(USER, id, false);
    expect(progress.useTopicProgressStore.getState().byUser[USER][id]).toBeUndefined();

    check.resolve(Response.json({ data: [] }));
    await first;
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/delete'))).toBe(true));
    expect(progress.useTopicProgressStore.getState().byUser[USER][id]).toBeUndefined();
    uncheck.resolve(Response.json({ data: [] }));
    await second;
    expect(await repository.db.topic_progress.count()).toBe(0);
  });

  it('coalesces superseded toggles on one leaf without an older failure rolling back the latest click', async () => {
    await progress.syncTopicProgressFromDb(USER);
    fetchMock.mockClear();
    const firstResponse = deferred<Response>();
    const lastResponse = deferred<Response>();
    fetchMock.mockImplementationOnce(() => firstResponse.promise).mockImplementationOnce(() => lastResponse.promise);
    const id = progress.topicProgressId('Algorithms', 'Graphs');
    const first = progress.useTopicProgressStore.getState().setCompleted(USER, id, true);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const second = progress.useTopicProgressStore.getState().setCompleted(USER, id, false);
    const third = progress.useTopicProgressStore.getState().setCompleted(USER, id, true);
    firstResponse.resolve(Response.json({ detail: 'connection reset' }, { status: 503 }));
    await first;
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(progress.useTopicProgressStore.getState().byUser[USER][id]).toBeTruthy();
    expect(fetchMock.mock.calls.every(([url]) => url.endsWith('/upsert'))).toBe(true);
    lastResponse.resolve(Response.json({ data: [] }));
    await Promise.all([second, third]);
    expect(await repository.db.topic_progress.count()).toBe(1);
  });

  it('restores the last confirmed value when the latest of several clicks fails', async () => {
    await progress.syncTopicProgressFromDb(USER);
    const firstResponse = deferred<Response>();
    const lastResponse = deferred<Response>();
    fetchMock.mockClear().mockImplementationOnce(() => firstResponse.promise).mockImplementationOnce(() => lastResponse.promise);
    const id = progress.topicProgressId('Algorithms', 'Graphs');
    const first = progress.useTopicProgressStore.getState().setCompleted(USER, id, true);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const second = progress.useTopicProgressStore.getState().setCompleted(USER, id, false);
    const third = progress.useTopicProgressStore.getState().setCompleted(USER, id, true);
    const rejected = expect(third).rejects.toThrow(/Could not confirm/);
    firstResponse.resolve(Response.json({ detail: 'offline' }, { status: 503 }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    lastResponse.resolve(Response.json({ detail: 'offline' }, { status: 503 }));
    await Promise.all([first, second, rejected]);
    expect(progress.useTopicProgressStore.getState().byUser[USER][id]).toBeUndefined();
    expect(await repository.db.topic_progress.count()).toBe(0);
  });

  it('retains an imported row ID when a click happens before initial progress finishes loading', async () => {
    const read = deferred<Response>();
    fetchMock.mockImplementation((url: string) => url.endsWith('/query') ? read.promise : Response.json({ data: [] }));
    const load = progress.syncTopicProgressFromDb(USER);
    const id = progress.topicProgressId('Algorithms', 'Graphs');
    const save = progress.useTopicProgressStore.getState().setCompleted(USER, id, false);
    read.resolve(Response.json({ data: [row('legacy-row-id', 'Graphs')] }));
    await Promise.all([load, save]);
    const deletion = fetchMock.mock.calls.find(([url]) => url.endsWith('/delete'));
    expect(JSON.parse(deletion![1].body).filters).toContainEqual({ field: 'id', op: 'eq', value: 'legacy-row-id' });
    expect(await repository.db.topic_progress.count()).toBe(0);
    expect(progress.useTopicProgressStore.getState().byUser[USER][id]).toBeUndefined();
  });
});

describe('syllabus loading and refresh isolation', () => {
  it('publishes progress before slow history finishes and deduplicates the tracker read', async () => {
    const history = deferred<Response>();
    fetchMock.mockImplementation((url: string) => url.includes('/questions/')
      ? history.promise : Response.json({ data: [row('saved-topic')] }));
    const load = repository.hydrateTables(USER, ['questions', 'topic_progress']);
    await progress.syncTopicProgressFromDb(USER);
    expect(await repository.db.topic_progress.count()).toBe(1);
    expect(fetchMock.mock.calls.filter(([url]) => url.includes('/topic_progress/'))).toHaveLength(1);
    history.resolve(Response.json({ data: [] }));
    await load;
  });

  it('does not invalidate practice snapshots or listeners after a checkbox save', async () => {
    const snapshot = repository.getTableSnapshot('questions');
    const changed = vi.fn();
    const unsubscribe = repository.subscribeDb(changed, ['questions', 'pyq_attempts', 'reattempts']);
    await repository.db.topic_progress.put({ ...row('topic'), sync_status: 'synced' });
    expect(changed).not.toHaveBeenCalled();
    expect(repository.getTableSnapshot('questions')).toBe(snapshot);
    unsubscribe();
  });

  it('does not overwrite acknowledged checks or resurrect unticks with an older refresh response', async () => {
    repository.seedLocalRows('topic_progress', [row('remove-me')]);
    const read = deferred<Response>();
    fetchMock.mockImplementation((url: string) => url.endsWith('/query') ? read.promise : Response.json({ data: [] }));
    const load = repository.hydrateTables(USER, ['topic_progress']);
    await Promise.all([
      repository.db.topic_progress.delete('remove-me'),
      repository.db.topic_progress.put({ ...row('new-check'), sync_status: 'synced' })
    ]);
    read.resolve(Response.json({ data: [row('remove-me'), row('another-device')] }));
    await load;
    expect((await repository.db.topic_progress.toArray()).map((item) => item.id).sort())
      .toEqual(['another-device', 'new-check']);
  });

  it('does not repopulate a signed-out account from a late save or hydration', async () => {
    const response = deferred<Response>();
    fetchMock.mockImplementation(() => response.promise);
    const load = repository.hydrateTables(USER, ['topic_progress']);
    const save = repository.db.topic_progress.put({ ...row('late-save'), sync_status: 'synced' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await repository.clearLocalData();
    progress.resetTopicProgressMemory();
    response.resolve(Response.json({ data: [row('late-read')] }));
    await Promise.all([load, save]);
    expect(await repository.db.topic_progress.count()).toBe(0);
    expect(progress.useTopicProgressStore.getState().byUser).toEqual({});
  });

  it('sends an uncached untick to the database', async () => {
    await repository.db.topic_progress.delete('not-yet-cached');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/compat/tables/topic_progress/delete');
  });

  it('keeps bulk writes and single-topic writes in order for shared rows', async () => {
    const batchResponse = deferred<Response>();
    fetchMock.mockImplementationOnce(() => batchResponse.promise);
    const batch = repository.db.topic_progress.bulkPut([
      { ...row('a'), sync_status: 'synced' }, { ...row('b'), sync_status: 'synced' }
    ]);
    const deletion = repository.db.topic_progress.delete('a');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    batchResponse.resolve(Response.json({ data: [] }));
    await Promise.all([batch, deletion]);
    expect((await repository.db.topic_progress.toArray()).map((item) => item.id)).toEqual(['b']);
  });
});
