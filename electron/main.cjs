const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');

const BACKEND_PORT = 8765;
let mainWindow = null;
let backendProcess = null;

function isDev() {
  return !app.isPackaged && process.env.NODE_ENV !== 'production';
}

function findSitePackages(venvDir) {
  if (!fs.existsSync(venvDir)) return null;
  const libDir = path.join(venvDir, 'lib');
  if (fs.existsSync(libDir)) {
    try {
      const pyDirs = fs.readdirSync(libDir).filter((f) => f.startsWith('python'));
      for (const pyDir of pyDirs) {
        const sp = path.join(libDir, pyDir, 'site-packages');
        if (fs.existsSync(sp)) return sp;
      }
    } catch (_) {}
  }
  const winSp = path.join(venvDir, 'Lib', 'site-packages');
  if (fs.existsSync(winSp)) return winSp;
  return null;
}

function getBackendConfig() {
  const resourceBackend = path.join(process.resourcesPath, 'backend');
  const projectBackend = path.resolve(__dirname, '../backends/python');
  const fallbackBackend = '/Users/bkalyankrishnareddy/Desktop/hetu/backends/python';

  let backendDir = fallbackBackend;
  if (fs.existsSync(resourceBackend)) {
    backendDir = resourceBackend;
  } else if (fs.existsSync(projectBackend)) {
    backendDir = projectBackend;
  }

  const candidateVenvs = [
    path.join(backendDir, '.venv'),
    path.join(projectBackend, '.venv'),
    '/Users/bkalyankrishnareddy/Desktop/hetu/backends/python/.venv',
  ];

  const candidatePythons = [
    path.join(backendDir, '.venv/bin/python'),
    path.join(backendDir, '.venv/bin/python3'),
    path.join(projectBackend, '.venv/bin/python'),
    path.join(projectBackend, '.venv/bin/python3'),
    '/Users/bkalyankrishnareddy/Desktop/hetu/backends/python/.venv/bin/python',
    '/Users/bkalyankrishnareddy/.pyenv/versions/3.12.13/bin/python3',
    '/Users/bkalyankrishnareddy/.pyenv/shims/python3',
    '/opt/homebrew/bin/python3.12',
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3.12',
    '/usr/local/bin/python3',
    path.join(backendDir, '.venv/Scripts/python.exe'),
    process.env.PYTHON_PATH,
    'python3',
    'python',
  ].filter(Boolean);

  let pythonPath = 'python3';
  for (const candidate of candidatePythons) {
    if (fs.existsSync(candidate)) {
      pythonPath = candidate;
      break;
    }
  }

  let sitePackages = null;
  for (const venv of candidateVenvs) {
    const sp = findSitePackages(venv);
    if (sp) {
      sitePackages = sp;
      break;
    }
  }

  return { backendDir, pythonPath, sitePackages };
}

function startBackend() {
  return new Promise((resolve) => {
    const { backendDir, pythonPath, sitePackages } = getBackendConfig();
    const userData = app.getPath('userData');
    const dbPath = path.join(userData, 'hetu.db');
    const imageDir = path.join(userData, 'images');
    const logFile = path.join(userData, 'backend.log');

    try {
      if (!fs.existsSync(imageDir)) {
        fs.mkdirSync(imageDir, { recursive: true });
      }
    } catch (err) {
      console.warn('[HETU Desktop] Image dir creation note:', err.message);
    }

    const resourceDist = path.join(process.resourcesPath, 'dist');
    const projectDist = path.resolve(__dirname, '../dist');
    const staticDir = fs.existsSync(resourceDist) ? resourceDist : projectDist;

    const pythonPathParts = [backendDir];
    if (sitePackages) {
      pythonPathParts.push(sitePackages);
    }
    if (process.env.PYTHONPATH) {
      pythonPathParts.push(process.env.PYTHONPATH);
    }
    const pythonPathEnv = pythonPathParts.join(process.platform === 'win32' ? ';' : ':');

    const extraPaths = [
      '/Users/bkalyankrishnareddy/.pyenv/shims',
      '/Users/bkalyankrishnareddy/.pyenv/versions/3.12.13/bin',
      '/opt/homebrew/bin',
      '/usr/local/bin',
    ];
    const newPath = [...extraPaths.filter((p) => fs.existsSync(p)), process.env.PATH || ''].join(':');

    console.log(`[HETU Desktop] Python: ${pythonPath}`);
    console.log(`[HETU Desktop] Backend dir: ${backendDir}`);
    console.log(`[HETU Desktop] Site packages: ${sitePackages || 'none'}`);
    console.log(`[HETU Desktop] Static dir: ${staticDir}`);
    console.log(`[HETU Desktop] SQLite Database: ${dbPath}`);
    console.log(`[HETU Desktop] Log file: ${logFile}`);

    const env = {
      ...process.env,
      PATH: newPath,
      PYTHONPATH: pythonPathEnv,
      ENVIRONMENT: 'local',
      DATABASE_URL: `sqlite+aiosqlite:///${dbPath}`,
      CORS_ORIGINS: `http://localhost:5173,http://127.0.0.1:${BACKEND_PORT},http://localhost:${BACKEND_PORT}`,
      TRUSTED_HOSTS: `localhost,127.0.0.1,127.0.0.1:${BACKEND_PORT}`,
      API_URL: `http://127.0.0.1:${BACKEND_PORT}`,
      STATIC_DIR: staticDir,
    };

    let logStream = null;
    try {
      logStream = fs.createWriteStream(logFile, { flags: 'a' });
    } catch (logErr) {
      console.warn('[HETU Desktop] Could not open log stream:', logErr.message);
    }

    try {
      backendProcess = spawn(
        pythonPath,
        ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(BACKEND_PORT)],
        {
          cwd: fs.existsSync(backendDir) ? backendDir : process.cwd(),
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );

      backendProcess.on('error', (err) => {
        console.error('[HETU Desktop] Backend spawn error:', err);
        if (logStream) logStream.write(`[Spawn error] ${err.stack || err}\n`);
        resolve(false);
      });

      backendProcess.stdout.on('data', (data) => {
        const text = data.toString();
        console.log(`[Backend] ${text.trim()}`);
        if (logStream) logStream.write(text);
      });

      backendProcess.stderr.on('data', (data) => {
        const text = data.toString();
        console.error(`[Backend ERR] ${text.trim()}`);
        if (logStream) logStream.write(text);
      });

      backendProcess.on('exit', (code, signal) => {
        const msg = `[HETU Desktop] Backend exited with code ${code}, signal ${signal}\n`;
        console.log(msg.trim());
        if (logStream) logStream.write(msg);
      });
    } catch (err) {
      console.error('[HETU Desktop] Failed to launch backend process:', err);
      if (logStream) logStream.write(`[Launch exception] ${err.stack || err}\n`);
      resolve(false);
      return;
    }

    // Poll until backend is healthy
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/health/live`, (res) => {
        if (res.statusCode === 200) {
          clearInterval(interval);
          console.log('[HETU Desktop] Backend is healthy and ready!');
          resolve(true);
        }
      });
      req.on('error', () => {
        if (attempts >= 40) {
          clearInterval(interval);
          console.warn('[HETU Desktop] Backend startup waiting timed out after 10s, launching UI anyway.');
          resolve(false);
        }
      });
    }, 250);
  });
}

function createWindow() {
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
      sandbox: false,
      webSecurity: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  const resourceDist = path.join(process.resourcesPath, 'dist');
  const projectDist = path.resolve(__dirname, '../dist');
  const staticDir = fs.existsSync(resourceDist) ? resourceDist : projectDist;

  const appUrl = `http://127.0.0.1:${BACKEND_PORT}`;
  const devUrl = 'http://localhost:5173';
  const targetUrl = isDev() && process.env.VITE_DEV_SERVER === 'true' ? devUrl : appUrl;

  mainWindow.loadURL(targetUrl).catch((err) => {
    console.error('[HETU Desktop] Error loading URL, retrying in 500ms:', err);
    setTimeout(() => {
      mainWindow.loadURL(targetUrl).catch((retryErr) => {
        console.error('[HETU Desktop] URL retry failed, falling back to static file:', retryErr);
        const indexPath = path.join(staticDir, 'index.html');
        if (fs.existsSync(indexPath)) {
          mainWindow.loadFile(indexPath);
        }
      });
    }, 500);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  ipcMain.handle('get-app-version', () => app.getVersion());

  await startBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (backendProcess) {
    console.log('[HETU Desktop] Terminating backend process...');
    try {
      backendProcess.kill('SIGTERM');
    } catch (_) {}
    backendProcess = null;
  }
});
