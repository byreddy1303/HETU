const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');

const BACKEND_PORT = Number(process.env.HETU_BACKEND_PORT || 8765);
if (!Number.isInteger(BACKEND_PORT) || BACKEND_PORT < 1 || BACKEND_PORT > 65535) {
  throw new Error('HETU_BACKEND_PORT must be a valid local TCP port.');
}

function getLocalDataDir({ env = process.env, platform = process.platform, homedir = os.homedir() } = {}) {
  if (env.HETU_DATA_DIR) return path.resolve(env.HETU_DATA_DIR);
  if (platform === 'darwin') return path.join(homedir, 'Library', 'Application Support', 'hetu');
  if (platform === 'win32') return path.join(env.APPDATA || path.join(homedir, 'AppData', 'Roaming'), 'hetu');
  return path.join(env.XDG_CONFIG_HOME || path.join(homedir, '.config'), 'hetu');
}

function getBackendDir({ resourcesPath, projectRoot = path.resolve(__dirname, '..') } = {}) {
  const candidates = [resourcesPath && path.join(resourcesPath, 'backend'), path.join(projectRoot, 'backends', 'python')];
  const backendDir = candidates.find((candidate) => candidate && fs.existsSync(path.join(candidate, 'app', 'main.py')));
  if (!backendDir) throw new Error('The HETU Python backend is missing. Rebuild or reinstall HETU.');
  return backendDir;
}

function getLocalEnvironment({ backendDir, dataDir = getLocalDataDir(), staticDir, env = process.env } = {}) {
  const resolvedDataDir = path.resolve(dataDir);
  const result = {
    ...env,
    // Both desktop and stdio MCP use this location, independent of their working directory.
    HETU_DATA_DIR: resolvedDataDir,
    ENVIRONMENT: 'local',
    MAINTENANCE_MODE: 'false',
    DATABASE_URL: `sqlite+aiosqlite:///${path.join(resolvedDataDir, 'hetu.db').replaceAll('\\', '/')}`,
    APP_URL: `http://127.0.0.1:${BACKEND_PORT}`,
    API_URL: `http://127.0.0.1:${BACKEND_PORT}`,
    CORS_ORIGINS: `http://localhost:5173,http://127.0.0.1:${BACKEND_PORT},http://localhost:${BACKEND_PORT}`,
    TRUSTED_HOSTS: 'localhost,127.0.0.1',
    PYTHONPATH: backendDir,
    PYTHONUNBUFFERED: '1',
    PYTHONDONTWRITEBYTECODE: '1',
  };
  // A GUI launch must not accidentally pick up a different Python installation.
  delete result.PYTHONHOME;
  // Local clients must never inherit hosted credentials from the shell or .env.
  for (const key of ['CLERK_SECRET_KEY', 'CLERK_JWT_KEY', 'CLERK_WEBHOOK_SECRET', 'MCP_RESOURCE_URL', 'CLERK_OAUTH_ISSUER', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_BASE_URL', 'SENTRY_DSN']) {
    result[key] = '';
  }
  if (staticDir) result.STATIC_DIR = staticDir;
  return result;
}

function getPythonRuntime({ backendDir, env = process.env, check = spawnSync } = {}) {
  const binDir = process.platform === 'win32' ? 'Scripts' : 'bin';
  const executable = process.platform === 'win32' ? 'python.exe' : 'python';
  const candidates = [...new Set([
    env.PYTHON_PATH,
    path.join(path.dirname(backendDir), 'python-runtime', 'bin', 'python3.12'),
    path.join(backendDir, '.venv', binDir, executable),
    ...(process.platform === 'darwin' ? ['/opt/homebrew/bin/python3', '/usr/local/bin/python3'] : []),
    'python3',
    'python',
  ].filter(Boolean))];
  const errors = [];
  for (const pythonPath of candidates) {
    if (path.isAbsolute(pythonPath) && !fs.existsSync(pythonPath)) {
      if (env.PYTHON_PATH === pythonPath) throw new Error(`The configured PYTHON_PATH does not exist: ${pythonPath}`);
      continue;
    }
    const runtimeEnv = { ...env, PYTHONPATH: backendDir };
    const result = check(pythonPath, ['-c', 'import sys; assert (3, 11) <= sys.version_info[:2] < (3, 13), "HETU requires Python 3.11 or 3.12"; import app.main; import app.mcp_local'], {
      cwd: backendDir, env: runtimeEnv, encoding: 'utf8', timeout: 20000, windowsHide: true, maxBuffer: 1024 * 1024,
    });
    if (!result.error && result.status === 0) return { pythonPath, env: runtimeEnv };
    errors.push(`${pythonPath}: ${result.error?.message || result.stderr?.trim() || `exited ${result.status}`}`);
    if (env.PYTHON_PATH) break;
  }
  throw new Error(`HETU could not find Python 3.11/3.12 with its backend dependencies. Install backends/python/requirements.txt into backends/python/.venv, or set PYTHON_PATH to a prepared interpreter.\n\n${errors.join('\n\n')}`);
}

function assertPortAvailable(port = BACKEND_PORT) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', (error) => reject(new Error(`HETU cannot start on 127.0.0.1:${port}: ${error.code === 'EADDRINUSE' ? 'the port is already in use. Close the other HETU instance or process and reopen HETU.' : error.message}`)));
    probe.listen({ host: '127.0.0.1', port, exclusive: true }, () => probe.close(resolve));
  });
}

function requestReadiness(port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const request = http.get(`http://127.0.0.1:${port}/health/ready`, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk.toString(); if (body.length > 16384) request.destroy(); });
      response.on('error', () => resolve(false));
      response.on('end', () => {
        try {
          const checks = JSON.parse(body).checks;
          resolve(response.statusCode === 200 && checks?.database === 'ok' && checks?.storage === 'local');
        }
        catch { resolve(false); }
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy());
    request.on('error', () => resolve(false));
  });
}

async function launchBackend({ backendDir, runtime, port = BACKEND_PORT, timeoutMs = 30000, logStream, onSpawn, spawnProcess = spawn, checkPort = assertPortAvailable, ready = requestReadiness } = {}) {
  await checkPort(port);
  const child = spawnProcess(runtime.pythonPath, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(port), '--no-proxy-headers'], {
    cwd: backendDir, env: runtime.env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  onSpawn?.(child);
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) { child.kill('SIGTERM'); reject(error); }
      else resolve(child);
    };
    const writeLog = (data) => {
      if (logStream && !logStream.destroyed && !logStream.writableEnded) logStream.write(data);
    };
    child.stdout?.on('data', writeLog);
    child.stderr?.on('data', writeLog);
    child.once('error', (error) => finish(new Error(`Could not launch the HETU backend: ${error.message}`)));
    child.once('exit', (code, signal) => {
      writeLog(`\nBackend exited: code ${code}, signal ${signal}\n`);
      finish(new Error(`The HETU backend stopped before it was ready (code ${code}, signal ${signal}).`));
    });
    const deadline = Date.now() + timeoutMs;
    const poll = async () => {
      if (settled) return;
      const healthy = await ready(port, Math.min(1000, timeoutMs));
      if (settled) return;
      if (healthy) return finish();
      if (Date.now() >= deadline) return finish(new Error(`The HETU backend did not become ready within ${timeoutMs / 1000} seconds.`));
      timer = setTimeout(poll, 200);
    };
    void poll();
  });
}

module.exports = { BACKEND_PORT, getLocalDataDir, getBackendDir, getLocalEnvironment, getPythonRuntime, assertPortAvailable, requestReadiness, launchBackend };
