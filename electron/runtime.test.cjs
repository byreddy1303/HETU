const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const { getLocalDataDir, getLocalEnvironment, getPythonRuntime, assertPortAvailable, requestReadiness, launchBackend } = require('./runtime.cjs');

test('desktop and MCP preserve the existing Mac database path regardless of cwd', () => {
  assert.equal(getLocalDataDir({ platform: 'darwin', homedir: '/Users/kalyan', env: {} }), '/Users/kalyan/Library/Application Support/hetu');
  const env = getLocalEnvironment({ backendDir: '/backend', dataDir: '/profile with spaces', env: {} });
  assert.equal(env.DATABASE_URL, 'sqlite+aiosqlite:////profile with spaces/hetu.db');
  assert.equal(env.APP_URL, 'http://127.0.0.1:8765');
  assert.equal(env.ENVIRONMENT, 'local');
});

test('local configuration overrides inherited hosted connections and maintenance mode', () => {
  const env = getLocalEnvironment({ backendDir: '/backend', env: {
    DATABASE_URL: 'postgres://hosted', MAINTENANCE_MODE: 'true', PYTHONHOME: '/wrong-python', PYTHONPATH: '/wrong-libs',
    UPSTASH_REDIS_REST_URL: 'https://hosted-redis', KV_REST_API_TOKEN: 'secret', R2_ACCOUNT_ID: 'hosted', SENTRY_DSN: 'https://hosted-sentry',
  } });
  assert.equal(env.MAINTENANCE_MODE, 'false');
  assert.equal(env.PYTHONHOME, undefined);
  assert.equal(env.PYTHONPATH, '/backend');
  for (const key of ['UPSTASH_REDIS_REST_URL', 'KV_REST_API_TOKEN', 'R2_ACCOUNT_ID', 'SENTRY_DSN']) assert.equal(env[key], '');
  assert.match(env.DATABASE_URL, /^sqlite\+aiosqlite:/);
});

test('explicit data directory and platform defaults support independent installations', () => {
  assert.equal(getLocalDataDir({ env: { HETU_DATA_DIR: '/test/workspace' } }), '/test/workspace');
  assert.equal(getLocalDataDir({ platform: 'linux', homedir: '/home/me', env: { XDG_CONFIG_HOME: '/config' } }), '/config/hetu');
  assert.equal(getLocalDataDir({ platform: 'win32', homedir: '/home/me', env: { APPDATA: '/roaming' } }), '/roaming/hetu');
});

test('packaged Python is selected without mixing another virtual environment', (t) => {
  const resources = fs.mkdtempSync(path.join(os.tmpdir(), 'hetu-runtime-'));
  t.after(() => fs.rmSync(resources, { recursive: true, force: true }));
  const python = path.join(resources, 'python-runtime', 'bin', 'python3.12');
  fs.mkdirSync(path.dirname(python), { recursive: true });
  fs.writeFileSync(python, 'test interpreter');
  const backendDir = path.join(resources, 'backend');
  const runtime = getPythonRuntime({ backendDir, env: {}, check: (command, args, options) => {
    assert.equal(command, python);
    assert.equal(options.env.PYTHONPATH, backendDir);
    assert.match(args[1], /import app\.mcp_local/);
    return { status: 0 };
  } });
  assert.equal(runtime.pythonPath, python);
});

test('an explicit missing or broken interpreter fails clearly without fallback', () => {
  assert.throws(() => getPythonRuntime({ backendDir: '/backend', env: { PYTHON_PATH: '/missing/python' } }), /PYTHON_PATH does not exist/);
  let checked = 0;
  assert.throws(() => getPythonRuntime({ backendDir: '/backend', env: { PYTHON_PATH: 'custom-python' }, check: () => {
    checked += 1;
    return { status: 1, stderr: 'No module named aiosqlite' };
  } }), /No module named aiosqlite/);
  assert.equal(checked, 1);
});

async function withServer(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return server.address().port;
}

test('readiness requires a healthy database and the local storage mode', async (t) => {
  let body = { status: 'ok', checks: { process: 'ok' } };
  const port = await withServer(t, (_request, response) => { response.writeHead(200); response.end(JSON.stringify(body)); });
  assert.equal(await requestReadiness(port), false);
  body = { checks: { database: 'ok', storage: 'local' } };
  assert.equal(await requestReadiness(port), true);
  body = { checks: { database: 'error', storage: 'local' } };
  assert.equal(await requestReadiness(port), false);
});

test('readiness rejects persistent HTTP errors and hung connections', async (t) => {
  const port = await withServer(t, (_request, response) => { response.writeHead(503); response.end('{}'); });
  assert.equal(await requestReadiness(port, 50), false);
  const hungPort = await withServer(t, () => {});
  assert.equal(await requestReadiness(hungPort, 50), false);
});

test('another process on the backend port is rejected before spawning', async (t) => {
  const port = await withServer(t, (_request, response) => response.end('unrelated server'));
  await assert.rejects(assertPortAvailable(port), /port is already in use/);
});

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = () => { child.killed = true; };
  return child;
}

test('startup reports a child import failure immediately', async () => {
  const child = fakeChild();
  await assert.rejects(launchBackend({
    backendDir: '/backend', runtime: { pythonPath: 'python', env: {} }, checkPort: async () => {}, ready: async () => false,
    spawnProcess: () => { setImmediate(() => child.emit('exit', 1, null)); return child; },
  }), /stopped before it was ready/);
  assert.equal(child.killed, true);
});

test('startup times out even when the backend responds but stays unhealthy', async () => {
  const child = fakeChild();
  await assert.rejects(launchBackend({
    backendDir: '/backend', runtime: { pythonPath: 'python', env: {} }, timeoutMs: 1,
    checkPort: async () => {}, ready: async () => false, spawnProcess: () => child,
  }), /did not become ready/);
  assert.equal(child.killed, true);
});

test('startup uses trusted TCP peer addresses and returns only after readiness', async () => {
  const child = fakeChild();
  const actual = await launchBackend({
    backendDir: '/backend', runtime: { pythonPath: 'python', env: {} },
    checkPort: async () => {}, ready: async () => true,
    spawnProcess: (_command, args) => { assert.ok(args.includes('--no-proxy-headers')); return child; },
  });
  assert.equal(actual, child);
  assert.equal(child.killed, false);
});
