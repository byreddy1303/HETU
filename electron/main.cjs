const { app, BrowserWindow, dialog, ipcMain, shell, powerMonitor } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { BACKEND_PORT, getLocalDataDir, getBackendDir, getLocalEnvironment, getPythonRuntime, launchBackend } = require('./runtime.cjs');
const { createDailyBrief } = require('./daily-brief.cjs');

// Preserve the existing profile and SQLite location when productName is capitalized.
app.setName('hetu');
const dataDir = getLocalDataDir();
let profileError;
try {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  app.setPath('userData', dataDir);
} catch (error) { profileError = error; }
let mainWindow = null;
let backendProcess = null;
let logStream = null;
let quitting = false;
let dailyBrief = null;
const appUrl = `http://127.0.0.1:${BACKEND_PORT}`;
const devUrl = 'http://localhost:5173';
const targetUrl = !app.isPackaged && process.env.VITE_DEV_SERVER === 'true' ? devUrl : appUrl;

function openExternal(url) {
  try {
    const parsed = new URL(url);
    if (['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password) {
      void shell.openExternal(parsed.href).catch((error) => console.error('Could not open link:', error.message));
    }
  } catch { /* Invalid and non-web URLs must not reach the operating system. */ }
}

async function createWindow(route = '/') {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#090a0f',
    title: 'HETU',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      additionalArguments: [`--hetu-api-url=${appUrl}`],
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try { if (new URL(url).origin === new URL(targetUrl).origin) return; } catch { /* Block invalid URL. */ }
    event.preventDefault();
    openExternal(url);
  });
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  mainWindow.on('closed', () => { mainWindow = null; });
  await mainWindow.loadURL(new URL(route, targetUrl).href);
}

function fail(error) {
  if (quitting) return;
  console.error('[HETU Desktop]', error);
  dialog.showErrorBox('HETU could not start', `${error.message}\n\nYour study data remains at:\n${dataDir}\n\nBackend log:\n${path.join(dataDir, 'backend.log')}`);
  app.quit();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (argv.includes('--daily-brief')) {
      void dailyBrief?.tick().catch(() => {});
      return;
    }
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.show();
    mainWindow?.focus();
  });
  app.whenReady().then(async () => {
    if (profileError) throw new Error(`HETU could not open its data directory: ${profileError.message}`);
    ipcMain.handle('get-app-version', () => app.getVersion());
    fs.mkdirSync(path.join(dataDir, 'images'), { recursive: true, mode: 0o700 });
    logStream = fs.createWriteStream(path.join(dataDir, 'backend.log'), { flags: 'a', mode: 0o600 });
    logStream.on('error', (error) => console.error('Cannot write backend log:', error.message));
    const backendDir = getBackendDir({ resourcesPath: process.resourcesPath });
    const staticDir = app.isPackaged ? path.join(process.resourcesPath, 'dist') : path.resolve(__dirname, '../dist');
    if (targetUrl === appUrl && !fs.existsSync(path.join(staticDir, 'index.html'))) {
      throw new Error('The desktop interface has not been built. Run npm run desktop:build or npm run desktop:pack first.');
    }
    const env = getLocalEnvironment({ backendDir, dataDir, staticDir });
    const runtime = getPythonRuntime({ backendDir, env });
    logStream.write(`\nStarting HETU with ${runtime.pythonPath}\nDatabase: ${env.DATABASE_URL}\n`);
    backendProcess = await launchBackend({ backendDir, runtime, logStream, onSpawn: (child) => { backendProcess = child; } });
    backendProcess.once('exit', (code, signal) => {
      if (!quitting) fail(new Error(`The HETU data service stopped (code ${code}, signal ${signal}). Reopen HETU to restart it.`));
    });
    await createWindow();
    dailyBrief = createDailyBrief({
      dataDir, port: BACKEND_PORT,
      allowAutoLaunch: app.isPackaged && process.env.HETU_TEST_DISABLE_AUTOLAUNCH !== '1',
      autoDeliver: process.env.HETU_TEST_DISABLE_AUTOLAUNCH !== '1',
      launchOptions: { pythonPath: runtime.pythonPath, backendDir, executable: app.getPath('exe') },
      show: (options) => dialog.showMessageBox(options),
      navigate: async (route) => {
        if (!mainWindow) await createWindow(route);
        else mainWindow.webContents.send('daily-brief:navigate', route);
        mainWindow.show();
        mainWindow.focus();
      },
    });
    const trustedSender = (event) => {
      if (!mainWindow || event.sender !== mainWindow.webContents ||
          new URL(event.senderFrame.url).origin !== new URL(targetUrl).origin) {
        throw new Error('Daily brief controls require the local HETU window.');
      }
    };
    ipcMain.handle('daily-brief:get', (event) => { trustedSender(event); return dailyBrief.status(); });
    ipcMain.handle('daily-brief:save', (event, patch) => { trustedSender(event); return dailyBrief.save(patch); });
    ipcMain.handle('daily-brief:preview', (event) => { trustedSender(event); return dailyBrief.tick(true); });
    await dailyBrief.start().catch((error) => console.error('Daily brief initialization:', error.message));
    powerMonitor.on('resume', () => { void dailyBrief?.tick().catch(() => {}); });
    triggerBackup(runtime, backendDir);
    setInterval(() => triggerBackup(runtime, backendDir), 60 * 60 * 1000);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0 && backendProcess) void createWindow().catch(fail);
    });
  }).catch(fail);
}

function triggerBackup(runtime, backendDir) {
  try {
    const backupScript = path.join(backendDir, 'scripts', 'backup_local_db.py');
    if (fs.existsSync(backupScript) && runtime?.pythonPath) {
      const { spawn } = require('node:child_process');
      const proc = spawn(runtime.pythonPath, [backupScript, '--source', path.join(dataDir, 'hetu.db'), '--backup-dir', path.join(dataDir, 'backups')], {
        env: { ...process.env, PYTHONPATH: backendDir, HETU_DATA_DIR: dataDir },
        detached: true,
        stdio: 'ignore',
      });
      proc.unref();
    }
  } catch (err) {
    console.error('Failed to trigger backup:', err.message);
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  quitting = true;
  dailyBrief?.stop();
  backendProcess?.kill('SIGTERM');
  backendProcess = null;
  logStream?.end();
});
