// Official, relocatable CPython from https://github.com/astral-sh/python-build-standalone.
// The pinned archive and digest are from the release's GitHub asset metadata.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { getLocalEnvironment, getPythonRuntime } = require('./runtime.cjs');

const RUNTIME = {
  release: '20261013',
  filename: 'cpython-3.12.15+20261013-aarch64-apple-darwin-install_only.tar.gz',
  sha256: 'ba32036ad8f4c434d97a1ee7feef8b7edc0fac16777639b97e39c74a108e4440',
};

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${command} failed (code ${code}, signal ${signal})`)));
  });
}

async function prepareRuntime({ projectRoot = path.resolve(__dirname, '..'), platform = process.platform, arch = process.arch } = {}) {
  // Native dependencies must be installed and tested on the target architecture.
  if (platform !== 'darwin' || arch !== 'arm64' || process.platform !== platform || process.arch !== arch) {
    throw new Error('The bundled HETU desktop backend currently supports building macOS arm64 on an Apple Silicon Mac. Build Windows, Intel Mac, and Linux runtimes on their matching hosts before adding those targets.');
  }
  const workDir = path.join(projectRoot, '.codex-tmp', 'desktop-runtime');
  const backendDir = path.join(projectRoot, 'backends', 'python');
  const runtimeDir = path.join(workDir, 'python');
  const requirements = fs.readFileSync(path.join(backendDir, 'requirements.txt'));
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(RUNTIME)).update(requirements).digest('hex');
  const marker = path.join(workDir, 'runtime.json');
  let cached;
  try { cached = JSON.parse(fs.readFileSync(marker, 'utf8')); } catch { /* First build. */ }
  if (cached?.fingerprint !== fingerprint || !fs.existsSync(path.join(runtimeDir, 'bin', 'python3.12'))) {
    fs.mkdirSync(workDir, { recursive: true });
    const archive = path.join(workDir, RUNTIME.filename);
    if (!fs.existsSync(archive) || crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex') !== RUNTIME.sha256) {
      console.log('[HETU] Downloading the pinned portable Python runtime...');
      const url = `https://github.com/astral-sh/python-build-standalone/releases/download/${RUNTIME.release}/${encodeURIComponent(RUNTIME.filename)}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error(`Python runtime download failed: HTTP ${response.status}`);
      const data = Buffer.from(await response.arrayBuffer());
      const actual = crypto.createHash('sha256').update(data).digest('hex');
      if (actual !== RUNTIME.sha256) throw new Error(`Python runtime checksum failed: expected ${RUNTIME.sha256}, received ${actual}`);
      fs.writeFileSync(archive, data);
    }
    fs.rmSync(runtimeDir, { recursive: true, force: true });
    fs.rmSync(marker, { force: true });
    await run('tar', ['-xzf', archive, '-C', workDir]);
    const python = path.join(runtimeDir, 'bin', 'python3.12');
    const env = getLocalEnvironment({ backendDir, dataDir: path.join(workDir, 'validation-data') });
    console.log('[HETU] Installing the backend into the portable runtime...');
    await run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '--no-cache-dir', '--only-binary=:all:', '-r', path.join(backendDir, 'requirements.txt')], { env });
    fs.writeFileSync(marker, JSON.stringify({ ...RUNTIME, fingerprint, platform, arch }, null, 2));
  }
  // Probe only imports, never start the API or open the user's database at build time.
  getPythonRuntime({ backendDir, env: { ...getLocalEnvironment({ backendDir, dataDir: path.join(workDir, 'validation-data') }), PYTHON_PATH: path.join(runtimeDir, 'bin', 'python3.12') } });
  console.log('[HETU] Portable backend runtime verified.');
  return runtimeDir;
}

module.exports = async (context) => {
  const arch = typeof context.arch === 'number' ? require('builder-util').Arch[context.arch] : context.arch;
  await prepareRuntime({ projectRoot: context.packager.projectDir, platform: context.electronPlatformName, arch });
};
module.exports.prepareRuntime = prepareRuntime;
