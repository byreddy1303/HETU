// Disposable SQLite workspace for browser-to-API verification, never the personal database.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { getLocalEnvironment } = require('../electron/runtime.cjs');

const root = path.resolve(__dirname, '..');
const backendDir = path.join(root, 'backends/python');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hetu-skill-test-'));
const python =
  process.env.HETU_TEST_PYTHON ||
  [
    path.join(root, '.codex-tmp/desktop-runtime/python/bin/python3'),
    path.join(backendDir, '.venv/bin/python')
  ].find((candidate) => fs.existsSync(candidate));
if (!python) throw new Error('Set HETU_TEST_PYTHON to the prepared backend interpreter.');
const env = getLocalEnvironment({ backendDir, dataDir });
env.CORS_ORIGINS = 'http://127.0.0.1:18767';
const child = spawn(
  python,
  ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '18766'],
  {
    cwd: backendDir,
    env,
    stdio: 'inherit'
  }
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill('SIGTERM'));
child.on('exit', (code) => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  process.exit(code || 0);
});
