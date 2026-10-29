#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { getBackendDir, getLocalDataDir, getLocalEnvironment, getPythonRuntime } = require('../electron/runtime.cjs');

try {
  const backendDir = getBackendDir();
  const dataDir = getLocalDataDir();
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const runtime = getPythonRuntime({ backendDir, env: getLocalEnvironment({ backendDir, dataDir }) });
  const args = process.argv.includes('--check')
    ? [path.join(backendDir, 'scripts', 'verify_local_mcp.py')]
    : ['-m', 'app.mcp_local'];
  const child = spawn(runtime.pythonPath, args, {
    cwd: backendDir, env: runtime.env, stdio: 'inherit', windowsHide: true,
  });
  const stop = (signal) => { child.kill(signal); };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
  child.once('error', (error) => { console.error(`HETU MCP could not start: ${error.message}`); process.exitCode = 1; });
  child.once('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
} catch (error) {
  // Stdout is reserved for MCP protocol frames.
  console.error(`HETU MCP could not start: ${error.message}`);
  process.exitCode = 1;
}
