const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDesktopRenderer } = require('./desktop-renderer.cjs');

test('desktop cache migration is origin-scoped and never clears learner storage', async () => {
  const calls = [];
  let release;
  const storageCleared = new Promise((resolve) => { release = resolve; });
  const session = {
    clearStorageData: async (options) => { calls.push(['storage', options]); await storageCleared; },
    clearData: async (options) => { calls.push(['cache', options]); },
  };
  let ready = false;
  const task = prepareDesktopRenderer(session, 'http://127.0.0.1:8765/memory').then(() => { ready = true; });
  assert.equal(ready, false);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1], { origin: 'http://127.0.0.1:8765', storages: ['serviceworkers', 'cachestorage'] });
  release();
  await task;
  assert.equal(ready, true);
  assert.deepEqual(calls[1][1], { origins: ['http://127.0.0.1:8765'], dataTypes: ['cache'] });
});

test('cache migration refuses a hosted origin before clearing any storage', async () => {
  const session = { clearStorageData: () => { throw new Error('must not run'); } };
  await assert.rejects(prepareDesktopRenderer(session, 'https://hetu.example'), /local app origin/);
});
