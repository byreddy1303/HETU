#!/usr/bin/env node
// Print client configuration, or explicitly register HETU in the local Codex host.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { getLocalDataDir } = require('../electron/runtime.cjs');

const launcher = path.resolve(__dirname, 'mcp-local.cjs');
const command = process.execPath;
const serverName = 'hetu-local';
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--install-codex')) {
  console.error('Usage: npm run mcp:setup [-- --install-codex]');
  process.exit(1);
}

if (args.includes('--install-codex')) {
  // Query only this server; other MCP configurations can contain credentials.
  const existing = spawnSync('codex', ['mcp', 'get', serverName, '--json'], { encoding: 'utf8' });
  if (existing.error) {
    console.error(`Cannot run the Codex CLI: ${existing.error.message}`);
    process.exit(1);
  }
  if (existing.status === 0) {
    try {
      const config = JSON.parse(existing.stdout);
      if (config.transport?.command !== command || JSON.stringify(config.transport?.args) !== JSON.stringify([launcher])) {
        throw new Error(`An existing ${serverName} server uses different settings. It was preserved; choose another name manually.`);
      }
      console.log(`${serverName} is already configured.`);
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  } else {
    const codexDir = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
    const configPath = path.join(codexDir, 'config.toml');
    if (fs.existsSync(configPath)) {
      const backup = path.join(codexDir, `config.toml.before-hetu-${Date.now()}`);
      fs.copyFileSync(configPath, backup, fs.constants.COPYFILE_EXCL);
      fs.chmodSync(backup, 0o600);
    }
    const result = spawnSync('codex', ['mcp', 'add', serverName, '--', command, launcher], { encoding: 'utf8' });
    if (result.error || result.status !== 0) {
      console.error(result.error?.message || result.stderr || 'Codex registration failed.');
      process.exit(1);
    }
    console.log(`Registered ${serverName}. Reopen the chat or reload MCP connections to discover its tools.`);
  }
}

console.log(`\nHETU personal database: ${path.join(getLocalDataDir(), 'hetu.db')}`);
console.log('\nFor a client that supports local stdio MCP, use:');
console.log(JSON.stringify({ mcpServers: { [serverName]: { command, args: [launcher] } } }, null, 2));
console.log('\nCodex registration command:');
console.log(`codex mcp add ${serverName} -- ${quote(command)} ${quote(launcher)}`);
console.log('\nChatGPT web requires a remote authenticated MCP connection or Secure MCP Tunnel.');
console.log('Use docs/local-desktop-mcp.md for connection and verification instructions.');
